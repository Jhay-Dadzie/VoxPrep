/**
 * Tests for the model fallback chain.
 *
 * Every Gemini call in a live interview is one the user is waiting on, and the
 * most likely failure is a rate limit on whichever model is doing the most
 * work. Quota is counted per model, so the fix is to ask a different one —
 * these tests pin down when that happens and, just as importantly, when it
 * must not.
 */

import { jest } from '@jest/globals';

const mockPost = jest.fn();

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    post: (...args) => mockPost(...args),
    // Not decoration. callGemini asks this about every rejection, to tell a
    // dropped connection apart from the errors it raises itself — so a mock
    // without it fails every test in this file on a TypeError before any of
    // the fallback behaviour is reached.
    isAxiosError: (error) => Boolean(error?.isAxiosError),
  },
}));

jest.mock('../../config/gemini.js', () => ({
  GEMINI_API_KEY: 'test-key',
  GEMINI_ENDPOINT: 'https://example.test/v1beta',
  GEMINI_MODEL: 'primary-model',
  GEMINI_MODEL_FALLBACKS: ['second-model', 'third-model'],
}));

import { callGemini } from '../ai/ai.service.js';

const answer = (text) => ({
  data: { candidates: [{ content: { parts: [{ text }] } }] },
});

const httpError = (status, message = 'boom', headers = {}) => ({
  isAxiosError: true,
  response: { status, statusText: message, data: { error: { message } }, headers },
});

/** Which model each attempt was addressed to, in order. */
const attemptedModels = () =>
  mockPost.mock.calls.map((call) => call[0].match(/models\/([^:]+):/)[1]);

const messages = [{ role: 'user', content: 'Ask me something' }];

// mockReset rather than clearAllMocks: clearing wipes the recorded calls but
// leaves the queued mockResolvedValueOnce values in place, so an unconsumed
// one answers the first request of whichever test runs next.
//
// The pause between chain walks is real time; what is under test is that it
// happens at all, not how long it lasts.
beforeEach(() => {
  mockPost.mockReset();
  process.env.GEMINI_RETRY_PAUSE_MS = '0';
});

describe('callGemini model fallback', () => {
  it('uses the primary model when it answers', async () => {
    mockPost.mockResolvedValue(answer('a question'));

    const result = await callGemini({ messages });

    expect(result).toBe('a question');
    expect(attemptedModels()).toEqual(['primary-model']);
  });

  it('moves to the next model when the primary is rate-limited', async () => {
    mockPost
      .mockRejectedValueOnce(httpError(429, 'Quota exceeded'))
      .mockResolvedValueOnce(answer('answered by the reserve'));

    const result = await callGemini({ messages });

    expect(result).toBe('answered by the reserve');
    expect(attemptedModels()).toEqual(['primary-model', 'second-model']);
  });

  /**
   * Google retires models from new keys without notice, and the id is only
   * resolved at request time — so a dead model looks exactly like this.
   */
  it('moves on when a model has been retired', async () => {
    mockPost
      .mockRejectedValueOnce(httpError(404, 'no longer available to new users'))
      .mockResolvedValueOnce(answer('still works'));

    await expect(callGemini({ messages })).resolves.toBe('still works');
    expect(attemptedModels()).toEqual(['primary-model', 'second-model']);
  });

  it('moves on when a model is overloaded', async () => {
    mockPost
      .mockRejectedValueOnce(httpError(503, 'high demand'))
      .mockResolvedValueOnce(answer('ok'));

    await expect(callGemini({ messages })).resolves.toBe('ok');
    expect(attemptedModels()).toHaveLength(2);
  });

  /**
   * Quota does not come back inside the request the user is waiting on, so the
   * chain is walked once and the failure reported — not walked again to spend
   * the same three exhausted quotas a second time.
   */
  it('walks the whole chain before giving up', async () => {
    mockPost.mockRejectedValue(httpError(429, 'Quota exceeded'));

    await expect(callGemini({ messages })).rejects.toMatchObject({ statusCode: 429 });
    expect(attemptedModels()).toEqual(['primary-model', 'second-model', 'third-model']);
  });

  /**
   * A malformed request is our bug, not a capacity problem: every model would
   * reject it identically, so retrying just spends three quotas to fail.
   */
  it('does not retry a request every model would reject', async () => {
    mockPost.mockRejectedValue(httpError(400, 'Invalid JSON payload'));

    await expect(callGemini({ messages })).rejects.toMatchObject({ statusCode: 400 });
    expect(attemptedModels()).toEqual(['primary-model']);
  });

  it('does not retry an authentication failure', async () => {
    mockPost.mockRejectedValue(httpError(403, 'API key not valid'));

    await expect(callGemini({ messages })).rejects.toMatchObject({ statusCode: 403 });
    expect(attemptedModels()).toEqual(['primary-model']);
  });

  it('accepts an explicit chain, and does not spend two attempts on one model', async () => {
    mockPost
      .mockRejectedValueOnce(httpError(429))
      .mockResolvedValueOnce(answer('graded'));

    const result = await callGemini({
      messages,
      model: ['grader', 'grader', 'grader-backup'],
    });

    expect(result).toBe('graded');
    expect(attemptedModels()).toEqual(['grader', 'grader-backup']);
  });

  it('accepts a single model as a plain string', async () => {
    mockPost.mockRejectedValue(httpError(429));

    await expect(callGemini({ messages, model: 'only-model' })).rejects.toMatchObject({
      statusCode: 429,
    });
    expect(attemptedModels()).toEqual(['only-model']);
  });
});

/**
 * Walking the chain a second time.
 *
 * The three candidates are spent inside a few hundred milliseconds — quicker
 * than a capacity spike takes to pass — so a chain walked once turns a blip
 * into a failed exam paper.
 */
describe('callGemini retry after a capacity spike', () => {
  it('walks the chain again when everything was overloaded', async () => {
    mockPost
      .mockRejectedValueOnce(httpError(503, 'high demand'))
      .mockRejectedValueOnce(httpError(503, 'high demand'))
      .mockRejectedValueOnce(httpError(503, 'high demand'))
      .mockResolvedValueOnce(answer('the spike passed'));

    await expect(callGemini({ messages })).resolves.toBe('the spike passed');
    expect(attemptedModels()).toEqual([
      'primary-model', 'second-model', 'third-model',
      'primary-model',
    ]);
  });

  it('gives up after the second walk rather than looping', async () => {
    mockPost.mockRejectedValue(httpError(503, 'high demand'));

    await expect(callGemini({ messages })).rejects.toMatchObject({ statusCode: 503 });
    expect(attemptedModels()).toHaveLength(6);
  });

  /**
   * A retired model is not a busy one. Nothing about waiting makes the id exist.
   */
  it('does not walk the chain again for models that no longer exist', async () => {
    mockPost.mockRejectedValue(httpError(404, 'no longer available to new users'));

    await expect(callGemini({ messages })).rejects.toMatchObject({ statusCode: 404 });
    expect(attemptedModels()).toHaveLength(3);
  });
});

/**
 * The budget for a whole call.
 *
 * Three models walked twice at two minutes each is twenty minutes of work on
 * one exam batch — long after the client that asked for it has given up. The
 * deadline is what keeps the chain inside the time the caller actually has.
 */
describe('callGemini deadline', () => {
  /** The per-call timeout axios was handed, in order. */
  const timeouts = () => mockPost.mock.calls.map((call) => call[2].timeout);

  it('stops walking the chain once the budget is spent', async () => {
    // Failing slowly, the way a real overloaded model does — an instant
    // rejection would spend the whole chain before any of the budget elapsed.
    mockPost.mockImplementation(
      () => new Promise((_, reject) => setTimeout(() => reject(httpError(503, 'high demand')), 400))
    );

    // Room for one candidate to fail, not for all three and a second walk.
    await callGemini({ messages, deadline: Date.now() + 1200 }).catch(() => {});

    expect(mockPost.mock.calls.length).toBeLessThan(6);
  });

  it('never lets one model outlast the budget meant for the chain', async () => {
    mockPost.mockResolvedValue(answer('quick'));

    await callGemini({ messages, timeoutMs: 120_000, deadline: Date.now() + 5_000 });

    expect(timeouts()[0]).toBeLessThanOrEqual(5_000);
  });

  it('uses the caller\'s timeout when there is no deadline', async () => {
    mockPost.mockResolvedValue(answer('quick'));

    await callGemini({ messages, timeoutMs: 120_000 });

    expect(timeouts()).toEqual([120_000]);
  });

  it('falls back to the default timeout when the caller names none', async () => {
    mockPost.mockResolvedValue(answer('quick'));

    await callGemini({ messages });

    expect(timeouts()).toEqual([60_000]);
  });
});

/**
 * Which failure speaks for the request.
 *
 * A dead model at the end of the chain used to answer for the whole call: the
 * primary's "quota exceeded" was replaced by a fallback's "high demand", and
 * the one status an operator could act on never reached the logs.
 */
describe('callGemini failure reporting', () => {
  it('reports the rate limit rather than the last model to be tried', async () => {
    mockPost
      .mockRejectedValueOnce(httpError(429, 'Quota exceeded for primary-model'))
      .mockRejectedValue(httpError(503, 'high demand'));

    await expect(callGemini({ messages })).rejects.toMatchObject({
      statusCode: 429,
      message: 'Quota exceeded for primary-model',
    });
  });

  it('carries every attempt for the log', async () => {
    mockPost.mockRejectedValue(httpError(404, 'gone'));

    const failure = await callGemini({ messages }).catch((error) => error);

    expect(failure.attempts).toEqual([
      { model: 'primary-model', status: 404, message: 'gone' },
      { model: 'second-model', status: 404, message: 'gone' },
      { model: 'third-model', status: 404, message: 'gone' },
    ]);
  });

  it('reports a budget that ran out before anything could be tried', async () => {
    mockPost.mockResolvedValue(answer('never asked'));

    const failure = await callGemini({ messages, deadline: Date.now() - 1 })
      .catch((error) => error);

    expect(failure.statusCode).toBe(503);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('waits as long as Google asks when it sends Retry-After', async () => {
    mockPost
      .mockRejectedValueOnce(httpError(503, 'high demand', { 'retry-after': '1' }))
      .mockRejectedValueOnce(httpError(503, 'high demand'))
      .mockRejectedValueOnce(httpError(503, 'high demand'))
      .mockResolvedValueOnce(answer('ok'));

    const started = Date.now();
    await expect(callGemini({ messages })).resolves.toBe('ok');

    // GEMINI_RETRY_PAUSE_MS is 0 here, so anything near a second came from the
    // header rather than the default.
    expect(Date.now() - started).toBeGreaterThanOrEqual(900);
  });
});
