# Configuration reference

Every environment variable read by VoxPrep, where it is read, what it defaults
to, and what happens when it is absent.

Configuration follows the [twelve-factor](https://12factor.net/config) principle:
everything that varies between deployments lives in the environment, not in
code. Secrets are never committed — `backend/.env` and `frontend/.env.local` are
git-ignored and must remain so.

## Table of contents

- [Backend](#backend)
- [Frontend](#frontend)
- [Minimum viable configuration](#minimum-viable-configuration)
- [Degraded modes](#degraded-modes)
- [Secret handling](#secret-handling)

## Backend

Loaded from `backend/.env` by `dotenv/config`, imported at the top of both
`src/app.js` and `src/server.js`.

### Runtime

| Variable | Required | Default | Read in | Purpose |
| --- | --- | --- | --- | --- |
| `PORT` | No | `3000` | `server.js` | HTTP listen port. The client defaults to `5050`, so use that in development unless you change both. |
| `NODE_ENV` | **Yes in production** | `development` | `server.js`, `app.js`, `auth.*`, `logger.js` | Gates several behaviours — see [the table below](#what-node_env-changes). |
| `CORS_ORIGIN` | **Yes in production** | unset | `app.js` | Comma-separated allowlist of browser origins. |
| `FRONTEND_URL` | Yes | unset | `auth.controller.js` | Base URL the OAuth and email-verification redirects return to. |

#### What `NODE_ENV` changes

| Behaviour | `development` | `production` |
| --- | --- | --- |
| Loopback and private-LAN origins (`localhost`, `127.0.0.1`, `10.x`, `192.168.x`, `172.16–31.x`) | Accepted automatically | **Rejected** unless in `CORS_ORIGIN` |
| `stack` field in error responses | Included | Omitted |
| Auth cookie flags | Relaxed for local HTTP | Hardened |
| Logger verbosity | Higher | Lower |

Setting `NODE_ENV=production` is a security control, not a performance tweak.
See [`SECURITY.md`](../SECURITY.md#operator-responsibilities).

### Supabase

| Variable | Required | Read in | Purpose |
| --- | --- | --- | --- |
| `SUPABASE_URL` | **Yes** | `config/supabase.js` | Project URL, `https://<ref>.supabase.co`. |
| `SUPABASE_PUBLISHABLE_KEY` | **Yes** | `config/supabase.js` | Anon/publishable key (`sb_publishable_…`). Used for user-scoped clients where row-level security applies. |
| `SUPABASE_SECRET_KEY` | **Yes** | `config/supabase.js`, `user.service.js` | Service-role key (`sb_secret_…`). **Bypasses RLS.** Server-side only. Account deletion returns `501` without it. |
| `SUPABASE_STORAGE_URL` | No | `config/storage.js` | Storage endpoint override; derived from `SUPABASE_URL` when unset. |
| `SUPABASE_EMAIL_CONFIRMATION` | No | `auth.store.js` | Whether the project requires email confirmation before sign-in. Must match the Supabase dashboard setting. |
| `DATABASE_URL` | No | Prisma adapter | Direct PostgreSQL connection string. Present for the Prisma client; the application path uses the Supabase JS client. |

> **`SUPABASE_SECRET_KEY` must never reach a device.** It is not an
> `EXPO_PUBLIC_*` variable, must not be logged, and must not appear in any
> client build artefact. It is the key that bypasses every RLS policy in
> [the data model](data-model.md#row-level-security).

### Google Gemini

Read in `config/gemini.js` unless noted. Gemini performs question generation,
answer grading, CV tailoring, and text-to-speech.

| Variable | Required | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | **Yes** | API credential. |
| `GEMINI_ENDPOINT` | No | Base endpoint override. |
| `GEMINI_MODEL` | No | Default generation model. |
| `GEMINI_MODEL_FALLBACKS` | No | Comma-separated models tried in order when the primary fails. |
| `GEMINI_ASSESSMENT_MODEL` | No | Model used for grading answers. |
| `GEMINI_ASSESSMENT_FALLBACKS` | No | Fallback chain for grading. |
| `GEMINI_CV_MODEL` | No | Model used for CV tailoring. |
| `GEMINI_CV_FALLBACKS` | No | Fallback chain for CV tailoring. |
| `GEMINI_TTS_MODEL` | No | Text-to-speech model. |
| `GEMINI_TIMEOUT_MS` | No | Per-request timeout (`ai.service.js`). |
| `GEMINI_RETRY_PAUSE_MS` | No | Pause between retries (`ai.service.js`). |
| `GEMINI_EXAM_TIMEOUT_MS` | No | Per-request timeout for exam generation (`exam.generator.js`). |
| `GEMINI_EXAM_BUDGET_MS` | No | Total wall-clock budget for generating a full paper (`exam.generator.js`). Exam preparation is the slowest request in the app; this is the ceiling. |

The fallback chains exist because a single model outage would otherwise take
down question generation entirely. `ai.fallback.test.js` covers the behaviour.

### Deepgram

| Variable | Required | Read in | Purpose |
| --- | --- | --- | --- |
| `DEEPGRAM_API_KEY` | For voice | `config/deepgram.js`, `config/deepgram-agent.js`, `agent.session.js` | Credential for both transcription and the Voice Agent. |
| `DEEPGRAM_AGENT_ENDPOINT` | No | `config/deepgram-agent.js` | Voice Agent WebSocket endpoint override. |
| `DEEPGRAM_AGENT_LISTEN_MODEL` | No | `config/deepgram-agent.js` | Speech-to-text model for the agent's listen stage. |
| `DEEPGRAM_AGENT_THINK_PROVIDER` | No | `config/deepgram-agent.js` | LLM provider for the agent's think stage. |
| `DEEPGRAM_AGENT_THINK_MODEL` | No | `config/deepgram-agent.js` | LLM model for the think stage. |
| `DEEPGRAM_AGENT_SPEAK_MODEL` | No | `config/deepgram-agent.js` | Default TTS model for the speak stage. Per-seat voices override it. |
| `DEEPGRAM_AGENT_IDLE_MS` | No | `config/deepgram-agent.js` | Silence before the agent considers the session idle. |
| `DEEPGRAM_AGENT_MAX_MS` | No | `config/deepgram-agent.js` | Hard ceiling on a single voice session. |

### Present but not on the active path

| Variable | Note |
| --- | --- |
| `OPENAI_API_KEY` | The `openai` SDK is a dependency; generation currently runs through Gemini. |
| `GROQ_API_KEY` | Present in the environment template; not read by `src/`. |

Neither is required to run the system. They are listed so an operator reading
an existing `.env` knows they can be omitted.

## Frontend

Expo exposes only variables prefixed `EXPO_PUBLIC_` to the bundle. **Anything
with that prefix is shipped to the device and is not a secret.**

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `EXPO_PUBLIC_API_URL` | Recommended | `http://localhost:5050/api/v1` | REST base URL. The WebSocket URL is derived from it (`http`→`ws`, plus `/interviews/agent`), so there is no second setting to keep in sync. |

Set it in `frontend/.env.local` for local development and in `frontend/eas.json`
per build profile for EAS builds.

### Development host resolution

`lib/api-client.ts` does not simply trust `EXPO_PUBLIC_API_URL` in development.
A hard-coded LAN IP silently breaks whenever DHCP hands out a new lease, and the
failure surfaces as an opaque axios `ERR_NETWORK`.

Instead, in `__DEV__` the client reads `Constants.expoConfig.hostUri` — the Expo
dev server the device is connected to *right now* — and reuses only the **port
and path** from `EXPO_PUBLIC_API_URL`:

```
resolved = http://<expo-host>:<port from EXPO_PUBLIC_API_URL>/<path from EXPO_PUBLIC_API_URL>
```

Tunnel hosts (`exp.direct`) are skipped, because the backend is not reachable
through them. In production builds `EXPO_PUBLIC_API_URL` is used verbatim.

Practical consequence: in development, only the **port** in
`EXPO_PUBLIC_API_URL` usually matters. If your API is not on `5050`, set it.

## Minimum viable configuration

```dotenv
# backend/.env
PORT=5050
NODE_ENV=development
FRONTEND_URL=http://localhost:8081

SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxxxxxxxxx
SUPABASE_SECRET_KEY=sb_secret_xxxxxxxxxxxxxxxx

GEMINI_API_KEY=xxxxxxxxxxxxxxxx
DEEPGRAM_API_KEY=xxxxxxxxxxxxxxxx
```

```dotenv
# frontend/.env.local
EXPO_PUBLIC_API_URL=http://192.168.1.20:5050/api/v1
```

Production adds, at minimum:

```dotenv
NODE_ENV=production
CORS_ORIGIN=https://app.example.com,https://www.example.com
FRONTEND_URL=https://app.example.com
```

## Degraded modes

The system starts with pieces missing, and degrades in a defined way rather than
crashing. This matters for local development and for partial outages.

| Missing | Effect |
| --- | --- |
| `DEEPGRAM_API_KEY` | The API starts and logs `DEEPGRAM_API_KEY is not set — live voice interviews are disabled.` WebSocket upgrades to `/api/v1/interviews/agent` are destroyed. Everything else — including written exams — works. |
| `SUPABASE_SECRET_KEY` | `DELETE /api/v1/users/me` returns `501 Not Implemented`. Other paths that rely on the service-role client will fail. |
| `GEMINI_API_KEY` | Question generation, grading, CV tailoring, and TTS fail. Auth, history, and reading existing data still work. |
| `CORS_ORIGIN` (production) | Only requests without an `Origin` header — native mobile, curl — are accepted. Browsers are refused. |
| `FRONTEND_URL` | OAuth and email-verification redirects have no destination to return to. |

## Secret handling

- `backend/.env` and `frontend/.env.local` are git-ignored. Verify with
  `git check-ignore -v backend/.env` before committing anything nearby.
- Rotate every provider key on suspicion of exposure, and after any contributor
  with access departs.
- Never paste a live key into an issue, a pull request, a log excerpt, or a test
  fixture. Tests mock the providers; see [testing](testing.md).
- In CI and hosting platforms, use the platform's secret store. Do not bake
  secrets into images or build artefacts.
- Audit what is public: anything under `EXPO_PUBLIC_*` ships to every device
  that installs the app.
