import { jest } from '@jest/globals';

jest.mock('../../core/errors/logger.js', () => ({
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  request: jest.fn(),
  default: {},
}));

import {
  isClockSkewFailure,
  isTransportFailure,
  runQuery,
  runQueryResult,
  supabaseError,
} from '../../core/utils/supabaseQuery.js';

/**
 * The failure this guards: POST /exams/prepare spent two minutes writing a
 * thirty-question paper, then lost all of it to a single dropped connection on
 * the INSERT that followed — reported to the student as "TypeError: fetch
 * failed", which is neither their problem nor something they could act on.
 *
 * postgrest-js does not reject on a network fault and does not retry writes, so
 * both halves — noticing that no answer came back, and trying again safely —
 * have to happen here.
 */

/** What postgrest-js returns when fetch itself rejects. */
const droppedConnection = {
  message: 'TypeError: fetch failed',
  details: 'TypeError: fetch failed\n\nCaused by: SocketError: other side closed (UND_ERR_SOCKET)',
  hint: '',
  code: '',
};

/** What it returns when Postgres itself refused the write. */
const rejectedByPostgres = {
  message: 'duplicate key value violates unique constraint',
  details: 'Key (id)=(…) already exists.',
  hint: '',
  code: '23505',
};

/**
 * What Supabase returns when the node checking a token has a clock behind the
 * node that signed it. Seen on GET /history/stats, where it reached the phone
 * as a 500 reading "JWT issued at future".
 */
const clockSkew = {
  message: 'JWT issued at future',
  details: null,
  hint: null,
  code: 'PGRST301',
};

/** The same family, but the client's problem rather than Supabase's. */
const expiredToken = {
  message: 'JWT expired',
  details: null,
  hint: null,
  code: 'PGRST301',
};

describe('telling a dropped connection from a rejected query', () => {
  it('recognises a fetch that never got an answer', () => {
    expect(isTransportFailure(droppedConnection)).toBe(true);
  });

  it('does not mistake a Postgres rejection for a network fault', () => {
    // The distinguishing mark is the SQLSTATE: a real answer always carries one.
    expect(isTransportFailure(rejectedByPostgres)).toBe(false);
  });
});

describe('what the caller is told', () => {
  it('describes a dropped connection in terms the user can act on', () => {
    const failed = supabaseError('save the exam questions', droppedConnection);

    expect(failed.message).toMatch(/try again/i);
    expect(failed.message).not.toMatch(/TypeError/);
    // A 503 rather than a 500: nothing is wrong with the request itself.
    expect(failed.statusCode).toBe(503);
  });

  it('keeps the technical explanation for the logs', () => {
    const failed = supabaseError('save the exam questions', droppedConnection);

    expect(failed.details).toMatch(/other side closed/);
  });

  it('passes a real database rejection through, with its SQLSTATE', () => {
    const failed = supabaseError('create the exam session', rejectedByPostgres);

    expect(failed.message).toMatch(/duplicate key/);
    expect(failed.pgCode).toBe('23505');
    expect(failed.statusCode).toBeUndefined();
  });
});

describe('runQuery', () => {
  it('returns the data when the query succeeds', async () => {
    const run = jest.fn().mockResolvedValue({ data: { id: 'abc' }, error: null });

    expect(await runQuery('read it', run)).toEqual({ id: 'abc' });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('retries a dropped connection and returns the second answer', async () => {
    const run = jest
      .fn()
      .mockResolvedValueOnce({ data: null, error: droppedConnection })
      .mockResolvedValueOnce({ data: { id: 'abc' }, error: null });

    const result = await runQuery('create the exam session', run, { replaySafe: true });

    expect(result).toEqual({ id: 'abc' });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('clears the half-written attempt before replaying a write', async () => {
    const order = [];
    const before = jest.fn(async () => order.push('delete'));
    const run = jest.fn(async () => {
      order.push('insert');
      return order.length === 1 ? { data: null, error: droppedConnection } : { data: 'ok', error: null };
    });

    await runQuery('save the exam questions', run, { replaySafe: true, before });

    // Without this the replay would write the rows a second time on top of a
    // first attempt that may have landed before the connection died.
    expect(order).toEqual(['insert', 'delete', 'insert']);
  });

  it('does not replay a write that was not made safe to replay', async () => {
    const run = jest.fn().mockResolvedValue({ data: null, error: droppedConnection });

    await expect(runQuery('save it', run)).rejects.toThrow(/try again/i);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('never retries a query the database actually answered', async () => {
    const run = jest.fn().mockResolvedValue({ data: null, error: rejectedByPostgres });

    await expect(runQuery('create the exam session', run, { replaySafe: true })).rejects.toThrow(
      /duplicate key/
    );
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('gives up rather than retrying forever', async () => {
    const run = jest.fn().mockResolvedValue({ data: null, error: droppedConnection });

    await expect(runQuery('save it', run, { replaySafe: true })).rejects.toThrow(/try again/i);
    expect(run).toHaveBeenCalledTimes(3);
  });
});

/**
 * A token Supabase signed and then would not accept.
 *
 * "JWT issued at future" is clock skew between two machines at the far end. It
 * carries a code, so it is not a transport failure; it is over in seconds, so
 * it is not an expired session; and it reached a user as a 500 blaming them for
 * neither.
 */
describe('a token rejected for its clock', () => {
  it('is not mistaken for a dropped connection', () => {
    expect(isClockSkewFailure(clockSkew)).toBe(true);
    expect(isTransportFailure(clockSkew)).toBe(false);
  });

  it('is not mistaken for an ordinary database rejection', () => {
    expect(isClockSkewFailure(rejectedByPostgres)).toBe(false);
  });

  it('reads as momentary, and never mentions JWTs', () => {
    const failed = supabaseError('work out your stats', clockSkew);

    expect(failed.message).toMatch(/try again/i);
    expect(failed.message).not.toMatch(/JWT/i);
    // 503, not 500: the fault is upstream and nothing about the request is wrong.
    expect(failed.statusCode).toBe(503);
  });

  it('is retried even on a query the caller never marked replay-safe', async () => {
    // Safe because the token is rejected at the door: no statement ever runs.
    const run = jest
      .fn()
      .mockResolvedValueOnce({ data: null, error: clockSkew })
      .mockResolvedValueOnce({ data: { id: 'abc' }, error: null });

    expect(await runQuery('delete that session', run)).toEqual({ id: 'abc' });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('still gives up rather than waiting out a skew that never clears', async () => {
    const run = jest.fn().mockResolvedValue({ data: null, error: clockSkew });

    await expect(runQuery('work out your stats', run)).rejects.toMatchObject({ statusCode: 503 });
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('sends an expired session to the client as a 401 it can refresh on', async () => {
    const run = jest.fn().mockResolvedValue({ data: null, error: expiredToken });

    await expect(runQuery('load your history', run)).rejects.toMatchObject({
      statusCode: 401,
      message: expect.stringMatching(/sign in again/i),
    });
    // Refreshing is the client's job; retrying here would only spend the wait.
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('runQueryResult', () => {
  it('hands back the count alongside the rows', async () => {
    const run = jest.fn().mockResolvedValue({ data: [{ id: 'a' }], error: null, count: 18 });

    const result = await runQueryResult('work out your stats', run, { replaySafe: true });

    expect(result.count).toBe(18);
    expect(result.data).toEqual([{ id: 'a' }]);
  });

  it('retries clock skew and keeps the count from the answer that worked', async () => {
    const run = jest
      .fn()
      .mockResolvedValueOnce({ data: null, error: clockSkew })
      .mockResolvedValueOnce({ data: [{ id: 'a' }], error: null, count: 18 });

    const result = await runQueryResult('work out your stats', run, { replaySafe: true });

    expect(result.count).toBe(18);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
