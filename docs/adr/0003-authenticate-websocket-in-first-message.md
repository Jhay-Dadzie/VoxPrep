# ADR-0003: The WebSocket authenticates in its first message, not the URL

- **Status:** Accepted
- **Date:** 2026-08-28 *(recorded retrospectively; the code predates this record)*
- **Deciders:** VoxPrep maintainers

## Context

The live voice interview opens a WebSocket that must be tied to a specific user
and a specific session. Supabase issues an access token, and the gateway needs
it.

The WebSocket handshake gives three places to put a credential, and each has a
different failure mode.

## Decision

The socket opens unauthenticated and **stays mute**. The first frame must be a
text frame containing JSON with `type: "start"` and a `token` field. Anything
else — a binary frame, malformed JSON, or another `type` — closes the socket
with `4401`.

A connection that sends nothing within **10 seconds** is closed with the same
code.

Loading the session context is also the ownership check: it throws for a session
belonging to someone else, so there is no separate authorization step to forget.

## Options considered

### Option A — `start` message *(chosen)*

The credential travels in the message body, which nothing logs by default. Works
identically from React Native and from a browser.

### Option B — `?token=…` on the URL

The obvious approach, and the wrong one. Query strings land in access logs,
proxy logs, and crash reports. **A Supabase access token in a log file is a live
credential**, readable by anyone with log access — which is a much larger set of
people than those with database access, and typically a set with weaker
retention controls.

### Option C — an `Authorization` header on the upgrade

Correct in principle and works from React Native. Rejected because the browser
WebSocket API cannot set headers, so the web target would need a different
mechanism — two authentication paths to keep correct, for one feature.

### Option D — a short-lived ticket minted over REST

`POST /interviews/:id/ticket` returns a single-use token, passed in the URL.
Solves the logging problem while keeping the URL simple.

Rejected as more moving parts than the problem needs: a new endpoint, a ticket
store, an expiry policy, and single-use semantics, to avoid one JSON message.
Worth revisiting only if a client appears that cannot send a first message
before audio.

## Consequences

### Positive

- No credential in any URL, and therefore none in access logs, proxy logs, or
  crash reports.
- One code path for every platform, including web.
- The authentication timeout bounds the cost of an unidentified open socket —
  otherwise a resource anyone can spend.
- Ownership is checked as a side effect of loading what the session needs
  anyway, so it cannot be skipped by adding a new code path.

### Negative

- Non-standard. A generic WebSocket client cannot connect without knowing the
  handshake; it is not discoverable from the URL alone. Hence
  [the protocol reference](../voice-agent-protocol.md).
- The server must hold an unauthenticated socket for up to 10 seconds.
- Clients must not send audio before `ready`, and a client that does gets closed
  rather than buffered.

### Neutral

- Close codes use the private `4000–4999` range: `4401` unauthorized, `4403`
  forbidden, `4404` not found, `4503` upstream unavailable — deliberately
  echoing the HTTP codes so their meaning is guessable.

## Implementation

- `backend/src/modules/agent/agent.gateway.js` — `AUTH_TIMEOUT_MS`,
  `resolveUser`, `onConnection`
- `frontend/services/voice-agent.ts` — the `start` frame

## Revisiting

Reopen if a client appears that cannot send a message before streaming audio, or
if the 10-second window proves too short on poor connections. The ticket
approach (Option D) is the fallback in either case.
