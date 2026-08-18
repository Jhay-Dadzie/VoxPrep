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
  default: { post: (...args) => mockPost(...args) },
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

const httpError = (status, message = 'boom') => ({
  response: { status, statusText: message, data: { error: { message } } },
});

/** Which model each attempt was addressed to, in order. */
const attemptedModels = () =>
  mockPost.mock.calls.map((call) => call[0].match(/models\/([^:]+):/)[1]);

const messages = [{ role: 'user', content: 'Ask me something' }];

beforeEach(() => jest.clearAllMocks());

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
