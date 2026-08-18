/**
 * Voice interview gateway — the handshake.
 *
 * Before any audio flows, the gateway has to prove who is calling and refuse
 * everything else. A socket that gets past this without credentials is one that
 * opens somebody else's interview, so the refusals are the part worth testing.
 *
 * The upstream Deepgram connection is stubbed. What matters here is the
 * handshake; the pairing of a live conversation into rows is covered by
 * agent.transcript.test.js, and the conversation itself was verified against the
 * live API.
 */

import { jest } from '@jest/globals';
import { createServer } from 'node:http';
import WebSocket from 'ws';

process.env.DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || 'test-key';

const mockLoadSessionContext = jest.fn();
const mockStartedSessions = [];

jest.mock('../interviews/interview.service.js', () => ({
  loadSessionContext: mockLoadSessionContext,
  MAX_SESSION_QUESTIONS: 15,
  addQuestionToSession: jest.fn(),
  submitAnswer: jest.fn(),
  completeSession: jest.fn(),
}));

jest.mock('../agent/agent.session.js', () => ({
  AgentSession: class {
    constructor(config) {
      mockStartedSessions.push(config);
      this.config = config;
    }

    start() {
      this.config.client.send(
        JSON.stringify({ type: 'ready', maxQuestions: this.config.options.maxQuestions })
      );
    }
  },
}));

const { attachAgentGateway } = require('../agent/agent.gateway.js');
const { signupTestUser } = require('../auth/auth.store.js');

let server;
let gateway;
let url;

beforeAll(async () => {
  server = createServer();
  gateway = attachAgentGateway(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `ws://127.0.0.1:${server.address().port}/api/v1/interviews/agent`;
});

afterAll(async () => {
  // Both, and in this order: the accepted handshake leaves a socket open, and
  // the HTTP server will not finish closing while the gateway still holds it.
  await new Promise((resolve) => gateway.close(resolve));
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  mockLoadSessionContext.mockReset();
  mockStartedSessions.length = 0;
});

/**
 * Open a socket, send one start message, and report how it was answered.
 *
 * Settles on either outcome, because they look different on the wire: a refusal
 * closes the socket, while an accepted handshake deliberately leaves it open for
 * the conversation. Waiting only for `close` would hang on the success case.
 */
const handshake = (payload) =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const events = [];
    let settled = false;

    const settle = (code, reason = '') => {
      if (settled) return;
      settled = true;
      clearTimeout(guard);
      try {
        socket.close();
      } catch {
        /* already closing */
      }
      resolve({ code, reason, events });
    };

    const guard = setTimeout(() => {
      settled = true;
      try {
        socket.close();
      } catch {
        /* already closing */
      }
      reject(new Error('gateway never answered the handshake'));
    }, 5000);

    socket.on('open', () => socket.send(JSON.stringify(payload)));
    socket.on('message', (raw) => {
      events.push(JSON.parse(raw.toString()));
      // A refusal sends an error and then closes; give that close a moment to
      // arrive so the code is reported rather than swallowed.
      setTimeout(() => settle(null), 100);
    });
    socket.on('close', (code, reason) => settle(code, reason.toString()));
    socket.on('error', () => {});
  });

const newUser = (prefix) =>
  signupTestUser({ email: `${prefix}-${Date.now()}-${Math.random()}@example.com`, password: 'Password123!' });

describe('voice interview gateway', () => {
  it('refuses a connection with no token', async () => {
    const result = await handshake({ type: 'start', session_id: 'abc' });

    expect(result.code).toBe(4401);
    expect(result.events[0]).toMatchObject({ type: 'error' });
    expect(mockStartedSessions).toHaveLength(0);
  });

  it('refuses a connection whose first message is not a start', async () => {
    const result = await handshake({ type: 'audio' });

    expect(result.code).toBe(4401);
    expect(mockStartedSessions).toHaveLength(0);
  });

  it('refuses a session the caller does not own', async () => {
    const { session } = newUser('owner');
    mockLoadSessionContext.mockRejectedValue(new Error('Interview session not found or access denied'));

    const result = await handshake({
      type: 'start',
      token: session.access_token,
      session_id: 'someone-elses-session',
    });

    expect(result.code).toBe(4404);
    expect(mockStartedSessions).toHaveLength(0);
  });

  it('refuses a session that has already been completed', async () => {
    const { session } = newUser('done');
    mockLoadSessionContext.mockResolvedValue({
      session: { status: 'completed', job_descriptions: { job_content: 'anything' } },
      questions: [],
    });

    const result = await handshake({
      type: 'start',
      token: session.access_token,
      session_id: 'finished-session',
    });

    expect(result.code).toBe(4403);
    expect(mockStartedSessions).toHaveLength(0);
  });

  it('refuses a session with no source material to interview from', async () => {
    const { session } = newUser('empty');
    mockLoadSessionContext.mockResolvedValue({
      session: { status: 'in_progress', job_descriptions: { job_content: '' } },
      questions: [],
    });

    const result = await handshake({
      type: 'start',
      token: session.access_token,
      session_id: 'blank-session',
    });

    expect(result.code).toBe(4403);
  });

  it('opens an interview for a valid session and clamps the question cap', async () => {
    const { user, session } = newUser('ok');
    mockLoadSessionContext.mockResolvedValue({
      session: { status: 'in_progress', job_descriptions: { job_content: 'Senior React Native Engineer' } },
      questions: [],
    });

    const result = await handshake({
      type: 'start',
      token: session.access_token,
      session_id: 'live-session',
      mode: 'job_interview',
      voice: 'm_measured_01',
      // Above the server's own ceiling: the client does not get to raise it.
      max_questions: 99,
    });

    expect(result.events[0]).toEqual({ type: 'ready', maxQuestions: 15 });
    expect(mockStartedSessions).toHaveLength(1);
    expect(mockStartedSessions[0]).toMatchObject({
      sessionId: 'live-session',
      userId: user.id,
      options: { mode: 'job_interview', voice: 'm_measured_01', maxQuestions: 15 },
    });
  });
});
