# ADR-0006: The client names voices by stable id; the server maps them to vendors

- **Status:** Accepted
- **Date:** 2026-08-28 *(recorded retrospectively; the code predates this record)*
- **Deciders:** VoxPrep maintainers

## Context

Each interviewer on the panel needs a voice. The obvious implementation is to
put the vendor's voice name in the client roster — `aura-2-thalia-en`, or
`kore` — and send it to the server.

Two facts make that a trap. Mobile clients cannot be updated on demand: an
installed build keeps sending whatever it was compiled with, for as long as the
user declines to update. And TTS vendors retire and rename voices on their own
schedule, without regard for what is installed on anyone's phone.

Those two together mean a vendor's catalogue change breaks installed apps, and
the only fix is an app release that some users will never take.

There is a product argument too. "A warm, conversational chair" is a casting
decision. Which vendor voice realises it is an implementation detail, and the
two should not be the same string.

## Decision

The client roster names voices by **stable VoxPrep ids** — `f_warm_01`,
`m_measured_01` — carrying no vendor information. The server resolves them to
catalogue keys in `backend/src/modules/interviews/voices.js`.

`resolveVoice` also accepts a raw catalogue key, so API consumers passing vendor
names directly keep working. Unknown values fall back to the default rather than
erroring: a stale voice id from an older build should still produce audio.

## Options considered

### Option A — indirection through stable ids *(chosen)*

The roster is a product decision; the catalogue is a vendor detail. Changing
vendors touches one server file.

This was tested in practice: the move from Deepgram Aura to Gemini changed
`voices.js` and nothing else. No app release was required, and installed builds
continued working without knowing anything had happened.

### Option B — vendor voice names in the client

Simpler, one fewer mapping to maintain, and the roster reads self-documenting.

Rejected because a retired voice name becomes a permanently broken panelist on
every installed build. The fallback would fire for that seat forever.

### Option C — the server sends the roster to the client at session start

No client-side roster at all; names and voices arrive over the wire.

Rejected because the client needs the roster **before** a session exists — the
practice screen shows who you will face while you are still choosing. It would
require a separate catalogue endpoint, and the avatars would still have to ship
in the bundle.

## Consequences

### Positive

- Swapping TTS vendors is a one-file server change with no app release.
- Vendor voice retirements cannot break installed builds.
- The roster reads as casting (`f_warm_01` — "warm, conversational chair")
  rather than as vendor configuration.
- The API accepts both forms, so direct consumers are not forced through the
  indirection.

### Negative

- **Two files must stay in sync**: `frontend/constants/interviewers.ts` and
  `backend/src/modules/interviews/voices.js`. Nothing enforces it at build time.
- The fallback is silent. A voice id the server does not recognise produces the
  default voice rather than an error, so a broken mapping presents as "that
  panelist sounds wrong" — which nobody reports.
- One more indirection to follow when debugging why a voice sounds unexpected.

### Neutral

- The silent fallback is what makes voice-collision resolution necessary in
  `panel.js`: two unknown ids both resolve to the default, producing a panel of
  one wearing several names. That is handled by resolving collisions against the
  catalogue rather than reporting them — a colleague in an unexpected voice is a
  far smaller failure than a colleague who is audibly the chair.

## Implementation

- `backend/src/modules/interviews/voices.js` — `VOICE_MAP`, `resolveVoice`
- `backend/src/modules/interviews/panel.js` — collision resolution
- `frontend/constants/interviewers.ts` — the roster
- `backend/src/modules/__test__/panel.test.js` — distinctness is tested

## Revisiting

The sync problem deserves a fix regardless of this decision: a shared JSON
manifest, or a generated constant, would make a drifted mapping a build failure
instead of a subtly wrong voice. That is an improvement to the implementation,
not a reversal of the decision.
