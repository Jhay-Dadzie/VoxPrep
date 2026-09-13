# Appendices

> Appendices carry evidence that supports the main text without interrupting it.
> The convention is that a reader should be able to skip every appendix and
> still follow the argument, and that an examiner who doubts a claim in the main
> text should be able to find its support here.
>
> Where an appendix below points to a file in the repository rather than
> reproducing it, decide before submission whether your department expects the
> content printed. Most accept a repository reference for source code and a
> printed extract for anything the argument turns on.

---

## Appendix A — Technology Inventory

Complete dependency manifests are in `backend/package.json` and
`frontend/package.json`. The principal components, with the version delivered:

### A.1 Backend

| Component | Version | Purpose |
| --- | --- | --- |
| Node.js | ≥ 20 LTS | Runtime |
| Express | 5.x | HTTP framework |
| `ws` | 8.x | WebSocket gateway |
| `@supabase/supabase-js` | 2.x | Database, auth, storage client |
| Joi | 18.x | Request validation |
| Helmet | 8.x | Security headers |
| `express-rate-limit` | 8.x | Per-address limits |
| Multer | 2.x | Multipart upload, memory storage |
| `pdf-parse` | 2.x | PDF extraction |
| `mammoth` | 1.x | DOCX extraction |
| `officeparser` | 7.x | Office and OpenDocument extraction |
| `word-extractor` | 1.x | Legacy DOC extraction |
| Winston | 3.x | Structured logging |
| Morgan | 1.x | HTTP access logging |
| Jest | 30.x | Test runner |
| Supertest | 7.x | HTTP integration testing |

### A.2 Client

| Component | Version | Purpose |
| --- | --- | --- |
| Expo SDK | 54 | Application framework |
| React Native | 0.81 | Cross-platform runtime |
| React | 19.1 | UI library |
| TypeScript | 5.9 | Language |
| `expo-router` | 6.x | File-based navigation |
| `react-native-audio-api` | 0.12 | Raw PCM capture and playback |
| Axios | 1.x | HTTP client with refresh interceptors |
| `@react-native-async-storage/async-storage` | 2.2 | Token and preference storage |
| `expo-document-picker` | 14.x | Source material selection |
| `expo-print`, `expo-sharing` | 15.x, 14.x | Tailored CV export |
| `react-native-reanimated` | 4.x | Animation |

### A.3 External services

| Service | Role | Failure behaviour |
| --- | --- | --- |
| Supabase | PostgreSQL, Auth, Storage | Hard dependency — the system cannot start without it |
| Language model service | Composition, grading, paper generation, CV rewriting, synthesis | Degrades: affected operations fail with a specific message; the rest of the system operates |
| Voice agent service | Duplex speech for live interviews | Degrades: the API starts, REST functionality is unaffected, socket upgrades are refused with a specific close code |

---

## Appendix B — API Reference

The complete machine-readable contract is
[`docs/api/openapi.yaml`](../api/openapi.yaml) (OpenAPI 3.1), with conventions,
envelopes, error semantics, rate limits, and pagination described in
[`docs/api/README.md`](../api/README.md).

### B.1 Response envelope

```jsonc
// success
{ "status": "success", "message": "…", "data": { /* endpoint-specific */ } }

// failure
{ "status": "error", "message": "human-readable reason" }
```

The health probe is the documented exception.

### B.2 Resource prefixes

| Prefix | Module |
| --- | --- |
| `/api/v1/auth` | Sign-up, sign-in, refresh, OAuth, verification, password reset |
| `/api/v1/users` | Own profile, status, account deletion |
| `/api/v1/job-descriptions` | Source material CRUD |
| `/api/v1/interviews` | Session lifecycle, preparation, per-turn interviewing |
| `/api/v1/exams` | Paper generation, sitting, marking, retaking |
| `/api/v1/questions` | Bulk question generation |
| `/api/v1/responses` | Candidate answers and per-session statistics |
| `/api/v1/speech` | Transcription, synthesis, voice and format catalogues |
| `/api/v1/feedback` | Grading and session summaries |
| `/api/v1/history` | Reviewable sessions, notes, archiving, statistics |
| `/api/v1/cv` | CV tailoring against a session's job description |

All routes except authentication and `/health` require `Authorization: Bearer
<access_token>`.

### B.3 Voice gateway

`WSS /api/v1/interviews/agent` — frame types, close codes, and the state machine
are in §3.10 and
[`docs/voice-agent-protocol.md`](../voice-agent-protocol.md).

---

## Appendix C — Architecture Decision Records

Seven positions were recorded at the time they were taken. Each record states
the context that forced the decision, the options considered, the option chosen,
and the consequences accepted. Full texts are in [`docs/adr/`](../adr/).

| ADR | Decision | Argued in |
| --- | --- | --- |
| [0001](../adr/0001-single-process-rest-and-websocket.md) | REST and the voice gateway share one process and one port | §3.7.2 |
| [0002](../adr/0002-separate-tables-for-written-exams.md) | Written exams get their own tables, sharing only the session | §3.8.2 |
| [0003](../adr/0003-authenticate-websocket-in-first-message.md) | The WebSocket authenticates in its first message, not the URL | §3.10 |
| [0004](../adr/0004-per-turn-question-generation.md) | Interview questions are generated per turn, not up front | §4.4.2 |
| [0005](../adr/0005-do-not-store-cv-source-text.md) | Extracted CV text is never persisted | §4.8.4 |
| [0006](../adr/0006-indirect-voice-identifiers.md) | The client names voices by stable id; the server maps them to vendors | §4.8.5 |
| [0007](../adr/0007-unreported-scores-are-null-not-zero.md) | Unreported grading metrics are null and excluded from averages | §4.5.3 |

> **Note to the author.** ADRs are among the strongest evidence a project report
> can carry, because they demonstrate that a position was argued *at the time*
> rather than reconstructed during write-up. Consider printing 0004, 0005, and
> 0007 in full — they support the three contributions an examiner is most likely
> to press you on.

---

## Appendix D — Requirements Elicitation Instrument

> **To be completed by the author if your department expects primary
> elicitation** (§3.3). Reproduce here: the questionnaire or interview schedule
> administered, the recruitment method, the number of respondents and their
> characteristics, and a summary of responses. Then add a column to Table 3.1
> tracing each requirement to the elicitation finding that produced it.

Suggested structure:

**D.1** Participant information sheet
**D.2** Questionnaire instrument
**D.3** Respondent demographics
**D.4** Summary of responses
**D.5** Mapping from findings to requirements

---

## Appendix E — Evaluation Instruments and Ethics Documentation

The protocols specified in §5.5–5.7 require the following, which must be
prepared and — where your institution requires it — approved before any
participant is recruited.

**E.1 — Participant information sheet.** What the study involves, that speech
will be captured and processed by third-party services, how long data is
retained, how to withdraw, and whom to contact.

**E.2 — Informed consent form.** Explicit consent for speech capture and
processing, session retention, and use of anonymised results in this report.

**E.3 — Instruction to participants regarding source material.** Participants
must be told in writing **not** to upload a real curriculum vitae, visa
application, or any document containing personal data (§5.6.3). Supply
non-sensitive material for them to use.

**E.4 — Task script** for the usability study (§5.6.1), covering the six tasks
in a fixed order with the wording read to each participant.

**E.5 — System Usability Scale form** — the ten items in Table 5.4, with the
five-point response scale and the scoring key.

**E.6 — Panel-attribution instrument** (§5.6.2): six excerpt slots, the roster
shown, the response sheet, and the five-point clarity item.

**E.7 — Human grader rubric** (§5.7): the five dimensions with their
descriptors, and the explicit instruction that a dimension may be left
unreported where it does not apply — this instruction is essential, since the
protocol tests agreement on *when* a dimension applies as well as on its value.

**E.8 — Ethics approval.** Reference number and approval letter.

---

## Appendix F — Database Schema

The complete schema for a new database is `backend/supabase_schema.sql`;
migrations for an existing one are in `backend/migrations/`. Entity
relationships are in Figure 3.7 and the narrative reference is
[`docs/data-model.md`](../data-model.md).

**F.1 — Tables.** Eleven persistent tables plus an append-only audit log
(Table 3.5).

**F.2 — Derived values.** Two triggers maintain per-session statistics and the
session's overall score (§3.8.3).

**F.3 — Access control.** Row-level security policies on every user-owned table
(Table 3.6), as defence in depth behind explicit ownership filters in every
service query.

**F.4 — Migration policy.** The full schema file is **not idempotent** and must
not be re-run over a live database. Existing databases take only the dated
migration files.

---

## Appendix G — Source Code

The system comprises 111 backend source files (~16,000 lines of JavaScript),
70 client source files (~13,200 lines of TypeScript), and 31 test suites
(~8,000 lines).

```
VoxPrep/
├── backend/
│   ├── migrations/           Dated SQL for live databases
│   ├── src/
│   │   ├── app.js            Middleware stack, routing, error handler
│   │   ├── server.js         Startup, gateway attachment, graceful shutdown
│   │   ├── config/           External service clients
│   │   ├── core/             Errors, middleware, utilities, response helpers
│   │   └── modules/          One directory per bounded context
│   └── supabase_schema.sql   Full schema for a fresh database
├── frontend/
│   ├── app/                  File-based routes
│   ├── components/           Shared presentational components
│   ├── constants/            Modes, interviewer roster, theme, upload rules
│   ├── hooks/                Context providers and custom hooks
│   ├── lib/                  API client, token storage, formatting, export
│   ├── services/             Typed wrapper per API module
│   └── types/                Shared contracts
└── docs/                     Documentation set, including this report
```

Each backend module follows one file convention:

```
<module>.routes.js       HTTP surface and route ordering
<module>.controller.js   Validation, status codes, error translation
<module>.service.js      Domain logic and persistence
<module>.mapper.js       Rows → wire shapes (the only path outward)
<module>.validation.js   Schemas
```

> **Note to the author.** Do not print the entire codebase. Most departments
> expect a repository reference plus printed extracts of the code the argument
> turns on. If yours asks for extracts, the strongest four are
> `interviews/panel.js` (C2), `feedback/scoring.engine.js` (C3),
> `agent/agent.transcript.js` (§4.4.5), and the closing sequence in
> `agent/agent.session.js` (§4.4.4). Each is short, self-contained, and
> demonstrates a claim made in the main text.

---

## Appendix H — Deployment and Operation

Full procedures are in [`docs/deployment.md`](../deployment.md);
[`docs/getting-started.md`](../getting-started.md) walks through a first run and
[`docs/configuration.md`](../configuration.md) documents every environment
variable in both workspaces.

### H.1 Prerequisites

| Requirement | Version | Notes |
| --- | --- | --- |
| Node.js | ≥ 20 LTS | Both workspaces |
| npm | ≥ 10 | Ships with Node 20 |
| Supabase project | — | PostgreSQL, Auth, Storage |
| Language model API key | — | Composition, grading, CV rewriting, synthesis |
| Voice agent API key | — | Live interviews; without it the API still runs and the gateway refuses upgrades |
| Expo Go or a development build | SDK 54 | A development build is required for live voice |

### H.2 Running

```bash
npm install                    # root tooling
npm install --prefix backend
npm install --prefix frontend

npm run backend                # API on :5050
npm run frontend               # Expo dev server on :8081

npm test --prefix backend      # 31 suites, serial, open-handle detection
```

### H.3 Reproducing the Chapter Five result

```bash
cd backend && npx jest --runInBand
```

Expected as reported in §5.3.1: 31 suites, 473 cases, 471 passed, 1 failed
(the stale assertion of §5.3.2), 1 skipped.

---

**Previous:** [References](references.md) · **Back to:** [Contents](README.md)
