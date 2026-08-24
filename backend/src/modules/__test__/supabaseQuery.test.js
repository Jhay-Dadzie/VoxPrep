import { jest } from '@jest/globals';

jest.mock('../../core/errors/logger.js', () => ({
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  request: jest.fn(),
  default: {},
}));

import { isTransportFailure, runQuery, supabaseError } from '../../core/utils/supabaseQuery.js';

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
