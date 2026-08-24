import { warn } from '../errors/logger.js';

/**
 * Running one Supabase query, and surviving a dropped connection.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * postgrest-js never rejects: a network failure comes back as
 * `{ error: { message: 'TypeError: fetch failed', details: 'Caused by: …' } }`,
 * and the pattern all over this codebase — `if (error) throw new Error(error.message)`
 * — keeps the useless half and drops the half that says what happened. A
 * dropped socket, a DNS failure and an unreachable project all reach the logs
 * as the same five characterless words, which is exactly what "TypeError: fetch
 * failed" was on POST /exams/prepare with nothing else to go on.
 *
 * The retry is the second half of the same problem. postgrest-js retries GET,
 * HEAD and OPTIONS by itself and deliberately does not retry writes, so an
 * INSERT that meets a dead connection fails outright — and in the exam flow
 * that INSERT arrives after two minutes of question generation, so a socket
 * closed while the model was working costs the user the entire paper.
 *
 * A connection idle for that long is the likely cause: HTTP keep-alive sockets
 * are closed by the far end after seconds, not minutes, and a request handed to
 * a socket the server has already closed fails before it is sent.
 */

/** Extra attempts after the first. Two is enough for a stale-socket race. */
const MAX_REPLAYS = 2;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * True when the request never got an answer — no status, no body, nothing.
 *
 * postgrest-js formats these as "<name>: <message>" with the underlying cause
 * in `details`, and the distinguishing feature is that `code` is empty: a real
 * PostgREST failure always carries a Postgres SQLSTATE or an HTTP status.
 */
export const isTransportFailure = (error) =>
  !!error && !error.code && /fetch failed|other side closed|socket hang up|network|ECONNRESET|ETIMEDOUT|EAI_AGAIN/i.test(
    `${error.message ?? ''} ${error.details ?? ''}`
  );

/**
 * Turn a postgrest error into a thrown Error that still says what went wrong.
 *
 * `details` is where the useful text lives — postgrest puts the undici cause
 * there as "Caused by: SocketError: other side closed (UND_ERR_SOCKET)". It is
 * kept on the error object as well as in the message so a caller that maps
 * errors for the client can show the short form and log the long one.
 */
export const supabaseError = (label, error) => {
  const transport = isTransportFailure(error);

  // What the user reads has to be about their situation, not about undici. The
  // technical text is not lost — it rides along on the error and the logger
  // writes it out — but "TypeError: fetch failed" reaching a student's phone
  // told them nothing, least of all that trying again might work.
  const failed = new Error(
    transport
      ? `Could not reach the database to ${label}. This is usually momentary — please try again.`
      : `Could not ${label}: ${error?.message || 'the database rejected the request'}`
  );

  if (transport) failed.statusCode = 503;
  failed.details = error?.details || null;
  failed.hint = error?.hint || null;
  failed.pgCode = error?.code || null;
  return failed;
};

/**
 * Run a Supabase query, retrying only what is safe to retry.
 *
 * @param {string}   label - what was being done, for the error and the log
 * @param {Function} run   - builds and runs the query; called again on a replay
 * @param {object}   [options]
 * @param {boolean}  [options.replaySafe=false]
 *        Whether running `run` twice is harmless. True for reads, and for a
 *        write whose `before` hook undoes a partial first attempt. Left false
 *        for a bare INSERT: a connection that dies after Postgres committed the
 *        row but before the response came back would otherwise insert it twice.
 * @param {Function} [options.before]
 *        Runs before each replay — the place to delete whatever the failed
 *        attempt may have written, which is what makes a write replay-safe.
 */
export const runQuery = async (label, run, { replaySafe = false, before } = {}) => {
  for (let attempt = 0; ; attempt += 1) {
    const { data, error } = await run();

    if (!error) return data;

    const failed = supabaseError(label, error);
    const canReplay = replaySafe && attempt < MAX_REPLAYS && isTransportFailure(error);

    if (!canReplay) throw failed;

    warn(
      `Supabase: could not ${label} (${error.message}); retrying`,
      error.details || null
    );

    await sleep(250 * 2 ** attempt);
    if (before) await before();
  }
};

export default { runQuery, supabaseError, isTransportFailure };
