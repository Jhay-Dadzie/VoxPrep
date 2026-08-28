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
 * A token Supabase signed itself but will not yet accept.
 *
 * "JWT issued at future" means the node checking the token has a clock behind
 * the node that minted it. Nothing is wrong with the request, the token or our
 * clock — it is skew between two machines at the other end, and it passes on
 * its own within seconds.
 *
 * It matters that this is told apart from the two failures it resembles. It is
 * not a transport failure: the request arrived and was answered, so it carries
 * a code and would never match `isTransportFailure`. And it is not an expired
 * token: expiry is the client's problem and is fixed by refreshing, while this
 * is fixed by waiting. Conflating it with either is how a momentary skew at
 * Supabase reached a user's phone as a 500.
 */
export const isClockSkewFailure = (error) =>
  !!error && /issued at future|used before issued|not yet valid|before issued at/i.test(
    `${error.message ?? ''} ${error.details ?? ''}`
  );

/** A token that was fine and is not any more. The client has to refresh. */
export const isExpiredTokenFailure = (error) =>
  !!error && /jwt expired|token (?:is )?expired|token has expired/i.test(
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
  const skew = isClockSkewFailure(error);
  const expired = isExpiredTokenFailure(error);

  // What the user reads has to be about their situation, not about undici. The
  // technical text is not lost — it rides along on the error and the logger
  // writes it out — but "TypeError: fetch failed" reaching a student's phone
  // told them nothing, least of all that trying again might work. "JWT issued
  // at future" told them even less, and told them it was their fault.
  const failed = new Error(
    transport
      ? `Could not reach the database to ${label}. This is usually momentary — please try again.`
      : skew
        ? `Could not ${label} just then. This is usually momentary — please try again.`
        : expired
          ? 'Your session has expired. Please sign in again.'
          : `Could not ${label}: ${error?.message || 'the database rejected the request'}`
  );

  // Skew is not the caller's fault and not their problem to fix, so it reads as
  // an upstream blip. Expiry is a 401 precisely so the client's own refresh
  // handling fires, which a 500 never does.
  if (transport || skew) failed.statusCode = 503;
  if (expired) failed.statusCode = 401;

  failed.details = error?.details || null;
  failed.hint = error?.hint || null;
  failed.pgCode = error?.code || null;
  return failed;
};

/**
 * Run a Supabase query, retrying only what is safe to retry, and hand back the
 * whole postgrest result — `{ data, count, status, ... }`.
 *
 * For callers that asked for a count alongside the rows. Most callers want
 * `runQuery` below, which is this with the rows unwrapped.
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
export const runQueryResult = async (label, run, { replaySafe = false, before } = {}) => {
  for (let attempt = 0; ; attempt += 1) {
    const result = await run();
    const { error } = result;

    if (!error) return result;

    const failed = supabaseError(label, error);

    // Skew is replayable whatever the caller said. A token rejected for its
    // `iat` is rejected at the door, before any statement runs, so replaying it
    // cannot write anything twice — the safety `replaySafe` guards against does
    // not arise. Waiting is the only thing that fixes it, and a second of it is
    // cheaper than handing the user an error for a condition already over.
    const canReplay = attempt < MAX_REPLAYS
      && (isClockSkewFailure(error) || (replaySafe && isTransportFailure(error)));

    if (!canReplay) throw failed;

    warn(
      `Supabase: could not ${label} (${error.message}); retrying`,
      error.details || null
    );

    await sleep(250 * 2 ** attempt);
    if (before) await before();
  }
};

/** The common case: the rows, or a thrown error. */
export const runQuery = async (label, run, options) =>
  (await runQueryResult(label, run, options)).data;

export default {
  runQuery,
  runQueryResult,
  supabaseError,
  isTransportFailure,
  isClockSkewFailure,
  isExpiredTokenFailure,
};
