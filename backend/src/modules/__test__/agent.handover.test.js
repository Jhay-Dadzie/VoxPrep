/**
 * Passing the floor around a panel, mid-interview.
 *
 * The failure this guards against is the one users actually reported: pick a
 * panel of three, and hear one voice for the whole interview. The fix is a
 * rotation driven from the session, and every part of it is invisible from
 * outside a live call — so it is driven here directly, against stub sockets.
 *
 * Two properties matter. The candidate must hear a different voice
 * (`UpdateSpeak`), and the model must know it has become someone else
 * (`UpdatePrompt`) — a new voice asking the previous panelist's follow-up is
 * still one interviewer, just a confusing one.
 */

import { jest } from '@jest/globals';

process.env.DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || 'test-key';

jest.mock('../interviews/interview.service.js', () => ({
  addQuestionToSession: jest.fn().mockResolvedValue({ id: 'question-row' }),
  submitAnswer: jest.fn().mockResolvedValue({}),
  completeSession: jest.fn().mockResolvedValue({}),
}));

const { AgentSession } = require('../agent/agent.session.js');
const { resolvePanel } = require('../interviews/panel.js');

const OPEN = 1;

const messagesTo = (socket) => socket.send.mock.calls.map(([raw]) => JSON.parse(raw));
const ofType = (socket, type) => messagesTo(socket).filter((message) => message.type === type);

const buildSession = (panelSize) => {
  const client = { readyState: OPEN, send: jest.fn(), on: jest.fn(), close: jest.fn() };
  const upstream = { readyState: OPEN, send: jest.fn(), close: jest.fn() };

  const session = new AgentSession({
    client,
    sessionId: 'session-1',
    userId: 'user-1',
    jobData: { title: 'Backend Engineer', job_content: 'Build Node.js services.' },
    options: {
      maxQuestions: 15,
      mode: 'job_interview',
      panel: resolvePanel(
        [
          { voiceId: 'f_warm_01', name: 'Dr. Rose-Mary', role: 'Chair' },
          { voiceId: 'm_direct_02', name: 'Marcus Bell', role: 'Technical' },
          { voiceId: 'f_precise_02', name: 'Priya Nair', role: 'Domain Expert' },
        ].slice(0, panelSize),
        { size: panelSize }
      ),
    },
  });
  session.upstream = upstream;

  return { session, client, upstream };
};

/** One agent turn: it speaks, then its audio ends. */
const turn = (session) => session.onUpstreamMessage(Buffer.from(JSON.stringify({ type: 'AgentAudioDone' })), false);

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('a panel interview', () => {
  it('hands the floor to a second panelist as the interview goes on', () => {
    const { session, upstream } = buildSession(3);

    turn(session); // greeting, by the chair
    expect(ofType(upstream, 'UpdateSpeak')).toHaveLength(0);

    turn(session); // the chair's first question
    const [handover] = ofType(upstream, 'UpdateSpeak');

    expect(handover.speak.provider.model).toBe(session.panel[1].model);
    expect(session.speakerIndex).toBe(1);
  });

  it('changes the brief in the same breath as the voice', () => {
    const { session, upstream } = buildSession(3);

    turn(session);
    turn(session);

    const [prompt] = ofType(upstream, 'UpdatePrompt');
    expect(prompt.prompt).toContain('RIGHT NOW YOU ARE MARCUS BELL');
    expect(prompt.prompt).toContain('taken over from Dr. Rose-Mary');
  });

  it('stops a panelist introducing themselves twice', () => {
    const { session, upstream } = buildSession(3);

    turn(session);
    turn(session); // handover to Marcus
    turn(session); // Marcus asks; the floor does not move

    const prompts = ofType(upstream, 'UpdatePrompt');
    expect(prompts).toHaveLength(2);
    expect(prompts[1].prompt).toContain('already have the floor');
    expect(session.speakerIndex).toBe(1);
  });

  it('reaches every seat rather than alternating between two', () => {
    const { session, upstream } = buildSession(3);

    // Six turns is one full lap: chair, Marcus, Priya, and back to the chair.
    for (let i = 0; i < 6; i += 1) turn(session);

    const heard = new Set(ofType(upstream, 'UpdateSpeak').map((message) => message.speak.provider.model));
    expect(heard).toEqual(new Set(session.panel.map((seat) => seat.model)));
  });

  it('tells the phone who is speaking, so the face matches the voice', () => {
    const { session, client } = buildSession(3);

    session.onUpstreamMessage(Buffer.from(JSON.stringify({ type: 'SettingsApplied' })), false);
    turn(session);
    turn(session);

    const announced = ofType(client, 'speaker');
    expect(announced.map((event) => event.name)).toEqual(['Dr. Rose-Mary', 'Marcus Bell']);
    expect(announced[1].index).toBe(1);
  });

  it('gives the sign-off back to the chair', () => {
    const { session, upstream } = buildSession(3);

    turn(session);
    turn(session); // Marcus has the floor
    expect(session.speakerIndex).toBe(1);

    session.beginClosing('ended_early');

    const speaks = ofType(upstream, 'UpdateSpeak');
    expect(speaks[speaks.length - 1].speak.provider.model).toBe(session.panel[0].model);
    expect(session.speakerIndex).toBe(0);
  });

  it('never hands over once the interview is closing', () => {
    const { session, upstream } = buildSession(3);

    session.beginClosing('ended_early');
    const before = upstream.send.mock.calls.length;

    turn(session);
    turn(session);

    expect(upstream.send.mock.calls).toHaveLength(before);
  });

  it('leaves a one-on-one alone', () => {
    const { session, upstream } = buildSession(1);

    for (let i = 0; i < 6; i += 1) turn(session);

    expect(ofType(upstream, 'UpdateSpeak')).toHaveLength(0);
    expect(ofType(upstream, 'UpdatePrompt')).toHaveLength(0);
  });
});
