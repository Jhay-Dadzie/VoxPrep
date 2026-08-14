/**
 * GET /history/stats Tests
 *
 * Two things are locked down here:
 *  1. Route ordering. '/stats' must be registered before '/:id', otherwise
 *     Express matches it as a session id and the endpoint answers
 *     404 "Session not found in history".
 *  2. The average spans every reviewable session, including pages beyond the
 *     first, and ignores sessions that have no score yet.
 */

import request from 'supertest';

const mockRange = jest.fn();

jest.mock('../../config/supabase.js', () => {
  const builder = {
    from: jest.fn(() => builder),
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    in: jest.fn(() => builder),
    order: jest.fn(() => builder),
    range: (...args) => mockRange(...args),
  };

  return {
    getSupabaseAdminClient: () => builder,
    getSupabaseClient: () => builder,
    getSupabaseClientForToken: () => builder,
    initializeUserProfile: async () => ({}),
  };
});

// Stand in for the real auth check. The rate limiters are passed through
// untouched because auth.routes.js imports them from the same module.
jest.mock('../auth/auth.middleware.js', () => {
  const passThrough = (_req, _res, next) => next();
  return {
    protect: (req, _res, next) => {
      req.user = { id: 'user-123' };
      next();
    },
    loginLimiter: passThrough,
    signupLimiter: passThrough,
    passwordLimiter: passThrough,
  };
});

import app from '../../app.js';

const page = (scores, count) => ({
  data: scores.map((overall_score) => ({ overall_score })),
  error: null,
  count,
});

beforeEach(() => {
  mockRange.mockReset();
});

describe('GET /api/v1/history/stats', () => {
  it('is not captured by the /:id route', async () => {
    mockRange.mockResolvedValue(page([], 0));

    const res = await request(app).get('/api/v1/history/stats');

    expect(res.status).toBe(200);
    expect(res.body.message).not.toBe('Session not found in history');
    expect(res.body.status).toBe('success');
  });

  it('averages every scored session', async () => {
    mockRange.mockResolvedValue(page([80, 90, 70], 3));

    const res = await request(app).get('/api/v1/history/stats');

    expect(res.body.data).toEqual({
      total_sessions: 3,
      scored_sessions: 3,
      average_score: 80,
    });
  });

  it('excludes unscored sessions from the average but counts them in the total', async () => {
    mockRange.mockResolvedValue(page([80, null, 90, null], 4));

    const res = await request(app).get('/api/v1/history/stats');

    expect(res.body.data).toEqual({
      total_sessions: 4,
      scored_sessions: 2,
      average_score: 85,
    });
  });

  it('rounds the average to two decimal places', async () => {
    mockRange.mockResolvedValue(page([80, 85, 91], 3));

    const res = await request(app).get('/api/v1/history/stats');

    // 256 / 3 = 85.333...
    expect(res.body.data.average_score).toBe(85.33);
  });

  it('reports a null average when nothing has been scored', async () => {
    mockRange.mockResolvedValue(page([null, null], 2));

    const res = await request(app).get('/api/v1/history/stats');

    expect(res.body.data.average_score).toBeNull();
    expect(res.body.data.scored_sessions).toBe(0);
    expect(res.body.data.total_sessions).toBe(2);
  });

  it('pages past the first response so long histories are fully averaged', async () => {
    // A full first page must trigger a second fetch; a short page stops it.
    const firstPage = new Array(1000).fill(100);
    mockRange
      .mockResolvedValueOnce(page(firstPage, 1001))
      .mockResolvedValueOnce(page([50], 1001));

    const res = await request(app).get('/api/v1/history/stats');

    expect(mockRange).toHaveBeenCalledTimes(2);
    expect(mockRange).toHaveBeenNthCalledWith(1, 0, 999);
    expect(mockRange).toHaveBeenNthCalledWith(2, 1000, 1999);
    expect(res.body.data.scored_sessions).toBe(1001);
    // (1000*100 + 50) / 1001
    expect(res.body.data.average_score).toBe(99.95);
  });

  it('only counts the caller\'s reviewable sessions', async () => {
    mockRange.mockResolvedValue(page([80], 1));

    await request(app).get('/api/v1/history/stats');

    const { getSupabaseAdminClient } = await import('../../config/supabase.js');
    const builder = getSupabaseAdminClient();
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'user-123');
    expect(builder.in).toHaveBeenCalledWith('status', ['completed', 'paused']);
  });
});
