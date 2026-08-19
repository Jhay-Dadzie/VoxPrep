/**
 * How a voice interview ends.
 *
 * The last exchange is only recognised as complete when the interviewer speaks
 * again, so reaching the question cap always catches it part-way through asking
 * one more. That makes the ending the subtlest part of the session: the audio
 * still playing when we decide to close belongs to a question nobody will
 * answer, and treating its end-of-audio as the end of the call hangs up before
 * the sign-off has been spoken at all.
 *
 * These tests drive the session's message handlers directly. The upstream
 * Deepgram socket and the phone are both stubs — what is under test is the
 * lifecycle decisions, not the transport.
 */

import { jest } from '@jest/globals';

process.env.DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || 'test-key';

const mockAddQuestion = jest.fn();
const mockSubmitAnswer = jest.fn();
const mockCompleteSession = jest.fn();

jest.mock('../interviews/interview.service.js', () => ({
  addQuestionToSession: mockAddQuestion,
  submitAnswer: mockSubmitAnswer,
  completeSession: mockCompleteSession,
}));

const { AgentSession } = require('../agent/agent.session.js');

const OPEN = 1;

const upstreamMessages = (upstream) => upstream.send.mock.calls.map(([raw]) => JSON.parse(raw));

/** A session wired to stub sockets, with `start()` deliberately not called. */
const buildSession = (maxQuestions = 2) => {
  const client = { readyState: OPEN, send: jest.fn(), on: jest.fn(), close: jest.fn() };
  const upstream = { readyState: OPEN, send: jest.fn(), close: jest.fn() };

  const session = new AgentSession({
    client,
    sessionId: 'session-1',
    userId: 'user-1',
    jobData: {},
    options: { maxQuestions },
  });
  session.upstream = upstream;

  return { session, client, upstream };
};

const say = (session, role, content) => session.onConversationText(role, content);

const upstreamEvent = (session, payload) =>
  session.onUpstreamMessage(Buffer.from(JSON.stringify(payload)), false);

/** Two full exchanges against a cap of two — enough to trigger the close. */
const runToCap = (session) => {
  say(session, 'assistant', 'Question one?');
  say(session, 'user', 'Answer one.');
  say(session, 'assistant', 'Question two?'); // completes exchange 1
  say(session, 'user', 'Answer two.');
  say(session, 'assistant', 'Question three?'); // completes exchange 2 -> cap reached
};

beforeEach(() => {
  jest.useFakeTimers();
  mockAddQuestion.mockReset().mockResolvedValue({ id: 'question-row' });
  mockSubmitAnswer.mockReset().mockResolvedValue({});
  mockCompleteSession.mockReset().mockResolvedValue({});
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('ending a voice interview', () => {
  it('asks the interviewer to sign off once the question cap is reached', () => {
    const { session, upstream } = buildSession(2);

    runToCap(session);

    expect(session.closing).toBe(true);

    const sent = upstreamMessages(upstream);
    expect(sent.map((m) => m.type)).toEqual(['UpdatePrompt', 'InjectAgentMessage']);
    // The cap line concedes the turn, because the interviewer has just started
    // asking one more question.
    expect(sent[1].content).toMatch(/that's everything I wanted to cover/i);
    expect(sent[1].content).toMatch(/thank you/i);
  });

  it('does not hang up on the audio that was already playing when it closed', () => {
    const { session } = buildSession(2);

    runToCap(session);
    // End-of-audio for "Question three?" — the question the cap interrupted.
    upstreamEvent(session, { type: 'AgentAudioDone' });

    expect(session.finished).toBe(false);
  });

  it('hangs up only after the sign-off itself has been spoken', () => {
    const { session, client } = buildSession(2);

    runToCap(session);
    upstreamEvent(session, { type: 'AgentAudioDone' });
    expect(session.finished).toBe(false);

    // The injected farewell comes back as an assistant turn, then finishes.
    upstreamEvent(session, {
      type: 'ConversationText',
      role: 'assistant',
      content: "Actually, that's everything I wanted to cover, so let's leave it there.",
    });
    expect(session.closingSpoken).toBe(true);

    upstreamEvent(session, { type: 'AgentAudioDone' });
    expect(session.finished).toBe(true);

    // The candidate still hears the farewell as transcript.
    const events = client.send.mock.calls.map(([raw]) => JSON.parse(raw));
    expect(events.some((e) => e.type === 'transcript' && /leave it there/.test(e.content))).toBe(true);
  });

  it('still ends if the sign-off never plays', () => {
    const { session } = buildSession(2);

    runToCap(session);
    expect(session.finished).toBe(false);

    // Injection refused, or its audio never arrives: the backstop closes it out
    // rather than waiting on a sign-off that is never coming.
    jest.advanceTimersByTime(15_000);
    expect(session.finished).toBe(true);
  });

  it('does not write the sign-off down as another question', async () => {
    const { session } = buildSession(2);

    runToCap(session);
    upstreamEvent(session, {
      type: 'ConversationText',
      role: 'assistant',
      content: "That's everything I wanted to cover. Thank you for your time.",
    });
    // A candidate replying to the farewell is being polite, not answering.
    say(session, 'user', 'Thanks, bye!');

    upstreamEvent(session, { type: 'AgentAudioDone' });
    await session.writeQueue;

    // Exactly the two real exchanges. Pairing the farewell with "thanks, bye"
    // would add a third question for the grader to score, which it can only
    // score badly.
    expect(mockAddQuestion).toHaveBeenCalledTimes(2);
    expect(session.askedCount).toBe(2);
    const questions = mockAddQuestion.mock.calls.map(([, , payload]) => payload.question_text);
    expect(questions).toEqual(['Question one?', 'Question two?']);
  });

  it('keeps an answer the candidate had already given when they end early', async () => {
    const { session } = buildSession(15);

    say(session, 'assistant', 'Question one?');
    say(session, 'user', 'Answer one.');
    // They tap End before the interviewer speaks again, so this exchange has
    // never been closed off by a role change.
    session.beginClosing('ended_early');
    upstreamEvent(session, {
      type: 'ConversationText',
      role: 'assistant',
      content: "Of course, let's wrap up there.",
    });
    upstreamEvent(session, { type: 'AgentAudioDone' });
    await session.writeQueue;

    expect(mockAddQuestion).toHaveBeenCalledTimes(1);
    expect(mockSubmitAnswer).toHaveBeenCalledTimes(1);
  });
});
