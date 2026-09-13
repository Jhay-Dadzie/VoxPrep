# Contributing to VoxPrep

Thank you for taking the time to contribute. This document describes how work
gets proposed, reviewed, and merged here. It follows the
[GitHub community health file](https://docs.github.com/en/communities) convention
and assumes familiarity with
[Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) and
[Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** in
this document are to be interpreted as described in
[RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Ways to contribute](#ways-to-contribute)
- [Development environment](#development-environment)
- [Branching model](#branching-model)
- [Commit messages](#commit-messages)
- [Coding standards](#coding-standards)
- [Documentation standards](#documentation-standards)
- [Testing requirements](#testing-requirements)
- [Database changes](#database-changes)
- [Pull request process](#pull-request-process)
- [Review checklist](#review-checklist)
- [Reporting bugs](#reporting-bugs)
- [Proposing features](#proposing-features)
- [Licensing](#licensing)
- [Getting help](#getting-help)

## Code of Conduct

This project is governed by the [Contributor Covenant v2.1](CODE_OF_CONDUCT.md).
By participating, you are expected to uphold it. Report unacceptable behaviour
through the channel named in that document.

## Ways to contribute

- **Report a bug** — see [Reporting bugs](#reporting-bugs).
- **Propose a feature** — see [Proposing features](#proposing-features).
- **Improve documentation** — corrections and clarifications are as welcome as
  code, and follow the same review process.
- **Submit code** — start from an issue where possible, so scope is agreed
  before effort is spent.

Security vulnerabilities are the exception: they **MUST NOT** be reported
through issues or pull requests. Follow [`SECURITY.md`](SECURITY.md).

## Development environment

Prerequisites and configuration are covered in
[`docs/getting-started.md`](docs/getting-started.md) and
[`docs/configuration.md`](docs/configuration.md). In brief:

```bash
npm install
npm install --prefix backend
npm install --prefix frontend

npm run backend    # http://localhost:5050
npm run frontend   # Expo dev server
```

You need a Supabase project, a Gemini API key, and — for live voice work — a
Deepgram API key. Real credentials **MUST NOT** be committed; `.env` and
`.env.local` are git-ignored and must stay that way.

## Branching model

`main` is the integration branch and is expected to stay releasable.

| Branch prefix | Purpose |
| --- | --- |
| `feat/` | New capability |
| `fix/` | Bug fix |
| `docs/` | Documentation only |
| `refactor/` | Behaviour-preserving restructuring |
| `test/` | Test-only changes |
| `chore/` | Tooling, dependencies, build |

Name branches after the change, not the person: `feat/exam-retake`, not
`feat/jd-work`. Work directly on `main` **SHOULD NOT** happen; branch first.

## Commit messages

Commits **MUST** follow Conventional Commits:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

Accepted types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`,
`build`, `ci`, `chore`, `revert`.

```
feat(exams): mark papers arithmetically and store the outcome
fix(auth): stop wiping tokens when a refresh fails on a transient network error
docs(api): describe the voice-agent close codes
refactor(panel): resolve voice collisions against the catalogue
```

A breaking change **MUST** be signalled either with `!` after the type/scope or
with a `BREAKING CHANGE:` footer, and **MUST** describe the migration path:

```
feat(interviews)!: move mode from the session row to the turn request

BREAKING CHANGE: clients that set `mode` at session creation must now send it
on every POST /interviews/:id/turn. Sessions created before this change are
unaffected and default to job_interview.
```

The subject line is imperative mood, lower case after the colon, no trailing
period, and **SHOULD** stay within 72 characters.

## Coding standards

### Both workspaces

- ES modules only. The repository sets `"type": "module"`; CommonJS
  `require()` **MUST NOT** be introduced.
- Relative imports in the backend **MUST** carry the `.js` extension. The
  codemod at `backend/scripts/rewrite-relative-imports-js.mjs` enforces this:
  `npm run codemod:js-extensions:check --prefix backend`.
- Match the surrounding code. Comment density, naming, and idiom in this
  repository are deliberate — new code that reads differently from its
  neighbours is a review comment.

### Comments

This codebase comments *why*, not *what*. A comment that restates the line
below it will be asked to justify itself; a comment that records the failure a
piece of code exists to prevent is valued and **SHOULD** be written. Follow the
tone already present in `backend/src/modules/interviews/panel.js` and
`backend/src/core/utils/documentFormats.js`.

### Backend module layout

New API surface **MUST** follow the established five-file convention:

| File | Responsibility |
| --- | --- |
| `<module>.routes.js` | HTTP surface, middleware, route ordering |
| `<module>.controller.js` | Validation, status codes, error translation |
| `<module>.service.js` | Business logic, persistence, ownership checks |
| `<module>.mapper.js` | Database rows → wire shapes |
| `<module>.validation.js` | Joi schemas |

Rules that follow from that split:

- Database rows **MUST NOT** reach a client except through a mapper. This is
  what keeps marking schemes out of a paper being sat and CV text out of a
  response body.
- Ownership **MUST** be enforced in the service with an explicit `user_id`
  filter. Row-level security is defence in depth, not the primary check — the
  API uses the service-role client for most reads.
- Static route segments **MUST** be registered before parametric ones at the
  same depth (`/stats` before `/:id`), and existing files document why.
- Controllers **MUST** translate service errors into accurate status codes.
  A user-fixable problem is a 4xx with a message the user can act on; only
  genuine faults reach the global handler as 500s.

### Frontend

- TypeScript, strict where the existing configuration sets it.
- Screens live in `app/` and are routed by file name (expo-router). Shared
  logic goes to `hooks/`, `lib/`, or `services/` — not into a screen.
- Every API call goes through `lib/api-client.ts`, so token attachment,
  refresh, and multipart handling stay in one place.
- Values that must agree with the server (mode ids, voice ids, accepted upload
  formats) are mirrored, not guessed. When you change one side, change the
  other in the same commit and say so in the message.

## Documentation standards

Documentation is part of the change, not a follow-up.

- Any change to a request or response shape **MUST** update
  [`docs/api/openapi.yaml`](docs/api/openapi.yaml) in the same pull request.
- Any change to the database **MUST** update
  [`docs/data-model.md`](docs/data-model.md).
- Any new or removed environment variable **MUST** update
  [`docs/configuration.md`](docs/configuration.md).
- Any change to the WebSocket frames or close codes **MUST** update
  [`docs/voice-agent-protocol.md`](docs/voice-agent-protocol.md).
- A decision that constrains future work — a technology choice, a schema shape
  that is hard to reverse, a protocol rule — **SHOULD** be recorded as an ADR in
  [`docs/adr/`](docs/adr/), using the template in that directory.

Prose conventions: British or American spelling consistently within a file,
sentence case for headings, fenced code blocks with a language tag, and
timestamps written in [ISO 8601](https://www.iso.org/iso-8601-date-and-time-format.html)
(`2026-08-28T14:03:00Z`).

## Testing requirements

```bash
npm test --prefix backend
npm test --prefix backend -- panel.test    # one suite
npm run lint --prefix frontend
```

- A bug fix **MUST** come with a test that fails before the fix and passes
  after it.
- New business logic **MUST** be covered. Pure logic — scoring, panel seating,
  mode resolution, document format detection — is tested directly, with no
  Express and no database.
- Tests **MUST NOT** call live external services. Supabase, Gemini, and
  Deepgram are mocked; see the existing suites in
  `backend/src/modules/__test__/`.
- Tests **MUST** pass locally before a pull request is opened.

Details, including why the suite runs with `--runInBand`, are in
[`docs/testing.md`](docs/testing.md).

## Database changes

`backend/supabase_schema.sql` describes a **fresh** project and is not
idempotent — its `CREATE INDEX` and `CREATE POLICY` statements cannot be
re-run over a live database.

Every schema change therefore requires **two** edits in the same commit:

1. Update `supabase_schema.sql` so a new project gets the change.
2. Add `backend/migrations/YYYY-MM-DD_<change>.sql`, written so it can be
   pasted into the Supabase SQL editor safely — including twice. Use
   `IF NOT EXISTS`, `DROP POLICY IF EXISTS` before `CREATE POLICY`, and guarded
   `DO $$ … $$` blocks for constraints.

New tables holding user data **MUST** have row-level security enabled and
own-row policies, following the pattern in
`backend/migrations/2026-08-21_exams.sql`.

## Pull request process

1. Open or reference an issue describing the problem.
2. Branch from `main` using the prefixes above.
3. Make the change, with tests and documentation.
4. Ensure `npm test --prefix backend` and `npm run lint --prefix frontend` pass.
5. Open the pull request with:
   - a title in Conventional Commits form;
   - a description of the problem, the approach, and any alternative rejected;
   - the verification you performed, including output where it is short;
   - screenshots or a screen recording for user-visible client changes;
   - explicit notes on anything left out of scope, and why.
6. Address review comments by pushing additional commits — avoid force-pushing
   a branch under review, so reviewers can read what changed.
7. A maintainer merges once the checklist below is satisfied.

## Review checklist

Reviewers and authors both work through this list.

- [ ] Change matches the stated scope; nothing unrelated has been folded in.
- [ ] Tests added or updated; the whole suite passes.
- [ ] No database row reaches a client except through a mapper.
- [ ] Ownership is enforced with an explicit `user_id` filter in the service.
- [ ] Errors carry accurate status codes and messages a user can act on.
- [ ] No secrets, tokens, or personal data in code, logs, or fixtures.
- [ ] Schema changes ship with both a schema-file edit and a dated migration.
- [ ] OpenAPI, data model, configuration, and protocol docs updated as applicable.
- [ ] Client and server agree on any mirrored constant.
- [ ] Commit messages follow Conventional Commits.
- [ ] `CHANGELOG.md` updated under `Unreleased` for user-visible changes.

## Reporting bugs

Open an issue including:

- what you expected and what happened instead;
- exact reproduction steps;
- affected area (API, client, both) and platform (iOS / Android / web);
- versions: Node, npm, Expo SDK, OS;
- relevant logs with **all credentials and access tokens removed**;
- the HTTP status and `message` from the response envelope, if applicable.

## Proposing features

Open an issue before writing code. Describe the user-facing problem, who has
it, and how you would know it was solved. Proposals that change the API surface,
the data model, or the voice protocol **SHOULD** include a draft ADR so the
trade-offs are reviewed before implementation rather than after.

## Licensing

`package.json` declares **ISC**. No `LICENSE` file naming a copyright holder is
present in this repository yet, so contributors and redistributors **SHOULD**
confirm terms with the maintainers before relying on that declaration. By
submitting a contribution you affirm that you have the right to submit it under
the project's terms.

## Getting help

Open a discussion or an issue with the `question` label. Include what you have
already tried — the existing troubleshooting notes under `frontend/*.md` cover
several recurring setup problems (network errors, signup, mobile testing) and
are worth checking first.
