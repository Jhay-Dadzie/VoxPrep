# Getting started

A guided first run: from an empty checkout to a completed practice session with
feedback on screen. Budget about 45 minutes, most of which is creating accounts
with the three external providers.

If you only need a variable reference, go to
[configuration](configuration.md) instead. If you want to know *why* the system
is shaped this way, go to [architecture](architecture.md).

## Table of contents

- [1. Prerequisites](#1-prerequisites)
- [2. Provider accounts](#2-provider-accounts)
- [3. Clone and install](#3-clone-and-install)
- [4. Create the database schema](#4-create-the-database-schema)
- [5. Configure the backend](#5-configure-the-backend)
- [6. Start and verify the API](#6-start-and-verify-the-api)
- [7. Configure and start the client](#7-configure-and-start-the-client)
- [8. Walk through the product](#8-walk-through-the-product)
- [9. Exercise the API directly](#9-exercise-the-api-directly)
- [Troubleshooting](#troubleshooting)
- [Where to go next](#where-to-go-next)

## 1. Prerequisites

| Requirement | Version | Check with |
| --- | --- | --- |
| Node.js | ≥ 20.x LTS | `node --version` |
| npm | ≥ 10.x | `npm --version` |
| Git | any recent | `git --version` |
| A physical device or emulator | — | For voice; the web target cannot exercise the microphone path fully |

The repository uses ES modules throughout (`"type": "module"` in both
workspaces). Node 18 will mostly work but is not tested; use 20 or newer.

## 2. Provider accounts

Create three accounts and collect four values.

### Supabase — database, auth, storage

1. Create a project at <https://supabase.com>.
2. From **Project Settings → API**, copy:
   - the **Project URL** → `SUPABASE_URL`
   - the **publishable / anon key** (`sb_publishable_…`) → `SUPABASE_PUBLISHABLE_KEY`
   - the **secret / service-role key** (`sb_secret_…`) → `SUPABASE_SECRET_KEY`
3. Under **Authentication → Providers**, enable **Email**. Enable **Google** too
   if you want to test OAuth.
4. Note whether **Confirm email** is on. It must match
   `SUPABASE_EMAIL_CONFIRMATION` in your `.env`.

> The secret key bypasses row-level security. It is a server-only credential —
> see [`SECURITY.md`](../SECURITY.md).

### Google Gemini — generation, grading, speech

Create an API key at <https://aistudio.google.com/apikey> → `GEMINI_API_KEY`.

Used for question generation, answer grading, CV tailoring, and text-to-speech.
Without it you can still sign in and browse, but nothing will be generated.

### Deepgram — live voice

Create an API key at <https://console.deepgram.com> → `DEEPGRAM_API_KEY`.

**Optional for a first run.** Without it the API starts normally, logs a
warning, and refuses WebSocket upgrades. Written exams, feedback, history, and
CV tailoring all work; only the spoken interview does not.

## 3. Clone and install

```bash
git clone <repository-url> VoxPrep
cd VoxPrep

npm install                    # root dev tooling (babel, jest presets)
npm install --prefix backend   # API dependencies
npm install --prefix frontend  # client dependencies
```

## 4. Create the database schema

Open your Supabase project → **SQL Editor** → **New query**.

### For a new project

Paste the entire contents of `backend/supabase_schema.sql` and run it. This
creates every table, index, trigger, view, and row-level-security policy, and
back-fills `public.users` from `auth.users`.

### For a database that already has data

Do **not** re-run `supabase_schema.sql`. Its `CREATE INDEX` and `CREATE POLICY`
statements are not idempotent and will fail or duplicate. Instead run the dated
files in `backend/migrations/` in filename order — each is written to be safe to
paste twice:

```
backend/migrations/2026-08-20_tailored_cvs.sql
backend/migrations/2026-08-21_exams.sql
```

### Verify

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;
```

You should see `users`, `job_descriptions`, `interview_sessions`,
`interview_questions`, `exam_questions`, `exam_answers`, `user_responses`,
`feedback`, `session_statistics`, `tailored_cvs`, `reminders`,
`user_statistics`, and `audit_log`.

Full reference: [data model](data-model.md).

## 5. Configure the backend

Create `backend/.env`:

```dotenv
PORT=5050
NODE_ENV=development
FRONTEND_URL=http://localhost:8081

SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxxxxxxxxx
SUPABASE_SECRET_KEY=sb_secret_xxxxxxxxxxxxxxxx
SUPABASE_EMAIL_CONFIRMATION=false

GEMINI_API_KEY=xxxxxxxxxxxxxxxx
DEEPGRAM_API_KEY=xxxxxxxxxxxxxxxx
```

Confirm it will not be committed:

```bash
git check-ignore -v backend/.env
```

Every variable is documented in [configuration](configuration.md).

## 6. Start and verify the API

```bash
npm run backend
```

You should see the startup banner and:

```
Voice interview gateway listening on /api/v1/interviews/agent
```

If `DEEPGRAM_API_KEY` is absent you will instead see a warning that live voice
interviews are disabled. That is expected and not fatal.

Verify:

```bash
curl http://localhost:5050/health
# {"success":true,"message":"Server is healthy","timestamp":"…"}

curl http://localhost:5050/api/v1/auth/health
# {"success":true,"message":"Auth service is healthy"}
```

## 7. Configure and start the client

Find your machine's LAN IP — a phone cannot reach `localhost`:

```bash
node frontend/get-ip.js
```

Create `frontend/.env.local`:

```dotenv
EXPO_PUBLIC_API_URL=http://192.168.1.20:5050/api/v1
```

Then:

```bash
npm run frontend
```

Scan the QR code with Expo Go, or press `a` / `i` / `w` for Android, iOS, or web.

> **In development the host is auto-detected.** The client derives the API host
> from the Expo dev server it is already connected to, so a changed DHCP lease
> does not break it. Only the **port** in `EXPO_PUBLIC_API_URL` reliably
> matters locally. See
> [configuration](configuration.md#development-host-resolution).

> **Live voice needs a development build, not Expo Go.** `react-native-audio-api`
> is a native module. Expo Go can exercise everything else — sign-up, exams,
> feedback, history, CV tailoring. See [frontend](frontend.md#native-requirements).

## 8. Walk through the product

1. **Sign up.** Enter an email and password. With
   `SUPABASE_EMAIL_CONFIRMATION=false` you go straight in; otherwise confirm via
   the emailed link first.
2. **Onboarding.** Complete the profile prompts.
3. **Practice → pick a mode.** Start with **Exam** if you have no Deepgram key —
   it needs no microphone.
4. **Supply material.** Paste at least 50 characters, or upload a PDF, Word,
   PowerPoint, Excel, OpenDocument, RTF, Markdown, CSV, or text file.
5. **Sit the session.**
   - *Exam*: thirty questions appear. Tap an option per question; answers save
     as you go, so closing the app resumes exactly where you left off. Submit to
     see your score with per-question explanations.
   - *Interview*: the panel is seated and the chair speaks first. Answer aloud.
     Questions are written one at a time against what you have already said.
6. **Read the feedback.** Per-answer scores across relevance, completeness,
   technical accuracy, clarity, and confidence, plus strengths, improvements,
   and suggestions.
7. **Check History.** The session is listed with its score. Open it for the full
   question-by-question review; add notes or archive it.
8. **Tailor a CV** (interview sessions). Upload a CV and receive it rewritten
   against the job description, with the changes explained, the keywords now
   evidenced, and the gaps stated honestly.

## 9. Exercise the API directly

Useful for backend work without the client in the loop.

```bash
# Sign up
curl -X POST http://localhost:5050/api/v1/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"dev@example.com","password":"Str0ng!Passw0rd","full_name":"Dev User"}'

# Sign in and keep the access token
TOKEN=$(curl -s -X POST http://localhost:5050/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"dev@example.com","password":"Str0ng!Passw0rd"}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).data.session.access_token')

# Who am I
curl http://localhost:5050/api/v1/auth/me -H "Authorization: Bearer $TOKEN"

# Prepare an interview from pasted text
curl -X POST http://localhost:5050/api/v1/interviews/prepare \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"job_content":"Senior backend engineer. Node.js, PostgreSQL, event-driven systems. Five years experience. Owns service reliability and on-call.","title":"Senior Backend Engineer","mode":"job_interview"}'

# Ask for the first question
curl -X POST http://localhost:5050/api/v1/interviews/<session-id>/turn \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"mode":"job_interview"}'

# Prepare an exam from an uploaded document
curl -X POST http://localhost:5050/api/v1/exams/prepare \
  -H "Authorization: Bearer $TOKEN" \
  -F 'document=@./lecture-notes.pdf' \
  -F 'title=Distributed Systems' \
  -F 'mode=exam'
```

The complete contract is in [`api/openapi.yaml`](api/openapi.yaml). Render it
interactively:

```bash
npx @redocly/cli preview-docs docs/api/openapi.yaml
```

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `ERR_NETWORK` in the client | Device cannot reach your machine | Use the LAN IP, not `localhost`. Confirm both are on the same network. Check the host firewall allows inbound `5050`. |
| `Origin not allowed by CORS` | Browser origin not on the allowlist | In development, loopback and private-LAN origins are accepted automatically — confirm `NODE_ENV` is not `production`. Otherwise add the origin to `CORS_ORIGIN`. |
| `401` on every protected call | Missing, expired, or malformed token | Send `Authorization: Bearer <access_token>`. The client refreshes automatically; a direct curl does not. |
| Voice session never starts | No Deepgram key, or Expo Go | Set `DEEPGRAM_API_KEY` and use a development build. |
| Upload rejected | Unsupported format | See the accepted list in [architecture](architecture.md#document-ingestion). Legacy `.ppt` / `.xls` must be re-saved as `.pptx` / `.xlsx`. |
| "Add more detail before generating questions" | Under 50 characters of readable text | Paste more, or upload a text-bearing file. A scanned image has no text to extract. |
| Exam preparation times out | Generating 30 questions is the slowest request in the app | Raise `GEMINI_EXAM_TIMEOUT_MS` / `GEMINI_EXAM_BUDGET_MS`. |
| `501` from `DELETE /users/me` | `SUPABASE_SECRET_KEY` not set | Add it to `backend/.env` and restart. |

Deeper, platform-specific notes live in the legacy files
`frontend/NETWORK_ERROR_TROUBLESHOOTING.md`, `frontend/MOBILE_TESTING.md`, and
`frontend/SIGNUP_TROUBLESHOOTING.md`. Where they disagree with `docs/`, `docs/`
is authoritative.

## Where to go next

- [Architecture](architecture.md) — how the pieces fit and why
- [API reference](api/README.md) — conventions, then the OpenAPI spec
- [Voice agent protocol](voice-agent-protocol.md) — the WebSocket contract
- [Frontend guide](frontend.md) — screens, state, and native requirements
- [Testing](testing.md) — before your first pull request
- [`CONTRIBUTING.md`](../CONTRIBUTING.md) — how changes get merged
