# Testing

How to run the suite, how to write a test that belongs here, and why the setup
is what it is.

## Table of contents

- [Running](#running)
- [Setup](#setup)
- [Where tests live](#where-tests-live)
- [What is covered](#what-is-covered)
- [Conventions](#conventions)
- [Mocking external services](#mocking-external-services)
- [Writing a new test](#writing-a-new-test)
- [Frontend](#frontend)
- [Continuous integration](#continuous-integration)

## Running

```bash
npm test --prefix backend                    # everything
npm test --prefix backend -- panel.test      # one suite by name fragment
npm test --prefix backend -- --watch         # watch mode
npm test --prefix backend -- --coverage      # coverage report
npm test --prefix backend -- -t "seats the roster"   # one test by name
```

From inside `backend/`, drop the `--prefix backend`.

The configured command is:

```
jest --runInBand --detectOpenHandles
```

**`--runInBand`** runs suites serially in one process. The suites share module
state — mocked Supabase clients, the in-memory auth store, timer mocks — and
parallel workers produce failures that depend on scheduling rather than on code.
Serial execution is slower and honest.

**`--detectOpenHandles`** surfaces anything still holding the event loop open
when a suite finishes. The application opens sockets, timers, and WebSocket
connections; a test that leaks one is a test that will hang in CI.

## Setup

| File | Contents |
| --- | --- |
| `backend/jest.config.cjs` | `testEnvironment: 'node'`, `babel-jest` for `.js` |
| `backend/babel.config.cjs` | `@babel/preset-env` targeting the current Node, transpiling ESM to CommonJS for Jest |

The source is ES modules; Jest runs them through Babel rather than using Node's
experimental VM modules. That is what makes `jest.mock()` work normally.

## Where tests live

```
backend/src/modules/__test__/
```

One directory, flat, named after what is being verified rather than after the
file under test — several suites cross module boundaries deliberately, because
that is where the behaviour lives.

## What is covered

| Suite | Verifies |
| --- | --- |
| `agent.gateway.test.js` | Handshake, authentication, close codes, session refusals |
| `agent.session.test.js` family (`agent.closing`, `agent.handover`, `agent.transcript`) | Closing sequence, speaker handover, transcript handling |
| `panel.test.js` | Panel seating, voice distinctness, floor rotation |
| `interview.setup.test.js`, `interview.prepare.test.js`, `interview.turn.test.js`, `interview.retake.test.js`, `interview.test.js` | Session lifecycle and the per-turn loop |
| `exam.generator.test.js`, `exam.marking.test.js` | Paper generation and arithmetic marking |
| `question.generator.test.js`, `question.test.js` | Question generation and validation |
| `feedback.test.js` | Grading pipeline and score handling |
| `cv.generator.test.js`, `cv.service.test.js` | CV tailoring |
| `auth.test.js`, `auth.refresh.test.js`, `auth-signup-existing-account.test.js` | Sign-up, sign-in, refresh, duplicate accounts |
| `user.test.js` | Profile and account operations |
| `history.test.js`, `history.mapper.test.js`, `history.stats.test.js` | History listing, mapping, statistics |
| `response.test.js` | Answer submission and retrieval |
| `speech.test.js` | Transcription and synthesis surfaces |
| `jobDescription.test.js` | Source material CRUD |
| `documentFormats.test.js` | Format detection by extension and MIME type |
| `sanitize.test.js` | Control codes and NUL bytes in parsed documents |
| `supabaseQuery.test.js` | Query helper, including clock skew and expired tokens |
| `ai.fallback.test.js` | Model fallback chains |

The comment at the top of `panel.test.js` states the principle these suites
follow:

> The bug this exists to prevent is a panel that sounds like one person. It has
> two halves — every seat must resolve to a *different* TTS model, and the
> rotation must actually reach every seat — and neither is visible until a real
> interview is running, which is exactly why they are tested here.

A test earns its place by covering something that would otherwise only fail in
production.

## Conventions

- **Every suite opens with a comment stating what failure it prevents.** Not
  what it calls — what breaks if it is deleted.
- **Pure logic is tested directly**, with no Express and no database: the
  scoring engine, panel seating, mode resolution, document format detection.
  These are the fastest and most valuable tests in the suite.
- **HTTP surfaces are tested with `supertest`** against the Express app, not a
  live server.
- **Fixtures are literals in the file**, close to the test that uses them.
  Shared fixtures are declared once at the top of a suite (see `ROSTER` and
  `JOB` in `panel.test.js`).
- **`describe` names the unit; `it` names the behaviour** as a sentence:
  `it('gives every seat a different voice')`.
- Assertions target the property that matters, not the whole object. Testing
  `models.size === 3` states the actual requirement; snapshotting the panel
  would pass for the wrong reasons and fail for irrelevant ones.

## Mocking external services

**No test calls a live external service.** Supabase, Gemini, and Deepgram are
mocked. A test that needs a real key is not a unit test.

Patterns already in use:

```js
// Provider credentials that only need to be present, not valid.
process.env.DEEPGRAM_API_KEY = 'test-key'

// Behaviour flags read at module load.
process.env.SUPABASE_EMAIL_CONFIRMATION = 'false'

// The in-memory auth store, so a suite can authenticate without Supabase.
import { getCurrentTestUser, shouldUseTestAuth } from '../auth/auth.store.js'
```

`ai.fallback.test.js` shows how to drive the model fallback chain by controlling
`GEMINI_RETRY_PAUSE_MS` so retries do not make the suite slow.

When adding a mock, mock at the **module boundary** — the config module that
builds the client — rather than the SDK's internals, so the mock survives an SDK
upgrade.

## Writing a new test

1. Name the failure. Write it as the file's opening comment before writing an
   assertion.
2. Put pure logic in its own suite with no HTTP and no database.
3. Use `supertest` only when the route wiring, middleware, or status-code
   translation is the thing under test.
4. Mock every external call.
5. Clean up. Clear timers, close sockets, and reset module state in
   `afterEach`. `--detectOpenHandles` will tell you if you did not.
6. Run the whole suite, not just yours — serial execution means a leak in your
   test surfaces in someone else's.

A bug fix **must** come with a test that fails before the fix and passes after
it. That is the check that the fix addresses the reported problem rather than a
neighbouring one.

## Frontend

There is no automated test suite for the client yet. What exists:

```bash
npm run lint --prefix frontend      # ESLint, eslint-config-expo
npx tsc --noEmit --project frontend # type check
```

Client changes are verified by running the app. Pull requests that change
user-visible behaviour should include a screenshot or a short screen recording —
see [`CONTRIBUTING.md`](../CONTRIBUTING.md#pull-request-process).

Adding React Native Testing Library coverage for `lib/api-client.ts` (refresh
queueing, `FormData` handling) and the mode/roster constants would be a
worthwhile contribution — those are pure enough to test without a device.

## Continuous integration

No CI configuration is committed to this repository yet. The commands a workflow
would need are:

```bash
npm ci --prefix backend
npm test --prefix backend

npm ci --prefix frontend
npm run lint --prefix frontend
```

CI must supply placeholder values for the environment variables read at module
load. It must **not** supply real provider credentials — no test needs them, and
a leaked CI secret is a live credential.
