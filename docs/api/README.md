# API reference

The VoxPrep HTTP API. Conventions, authentication, error handling, and the
endpoint index live here; the complete machine-readable contract is in
[`openapi.yaml`](openapi.yaml).

The live voice interview is not HTTP — see
[voice agent protocol](../voice-agent-protocol.md).

## Table of contents

- [Base URL and versioning](#base-url-and-versioning)
- [Authentication](#authentication)
- [Response envelope](#response-envelope)
- [Errors](#errors)
- [Status codes](#status-codes)
- [Pagination](#pagination)
- [Content types and uploads](#content-types-and-uploads)
- [Rate limiting](#rate-limiting)
- [Health checks](#health-checks)
- [Endpoint index](#endpoint-index)
- [Using the OpenAPI document](#using-the-openapi-document)

## Base URL and versioning

```
http://localhost:5050/api/v1        development
https://<your-host>/api/v1          production
```

The version is in the path. A breaking change to an existing endpoint's contract
introduces `/api/v2`; additive, backwards-compatible changes do not.

The API also tolerates input from older client builds where doing so is
harmless. Two live examples:

- `mode=oral_exam` is accepted and normalised to `exam`. An older build still
  has that id in local storage and sends it on every request; rejecting it would
  break setup for anyone who has not updated.
- `POST /interviews/prepare` accepts and ignores `questionCount`. Questions are
  no longer generated up front, but an older client's setup request should not
  be rejected outright.

## Authentication

Supabase Auth issues the tokens; the API validates them.

```http
Authorization: Bearer <access_token>
```

Unauthenticated endpoints: everything under `/auth` except `/auth/me`,
`/auth/change-password`, and `/auth/logout`; plus `/health` and every module's
`/health`.

### Obtaining a session

```http
POST /api/v1/auth/login
Content-Type: application/json

{ "email": "user@example.com", "password": "…" }
```

```jsonc
{
  "status": "success",
  "data": {
    "session": {
      "access_token": "eyJ…",
      "refresh_token": "…",
      "expires_at": 1756392000
    },
    "user": { "id": "…", "email": "…", "full_name": "…" }
  }
}
```

### Refreshing

```http
POST /api/v1/auth/refresh
Content-Type: application/json

{ "refresh_token": "…" }
```

The refresh token may instead be sent as a `refresh_token` cookie.

The client (`frontend/lib/api-client.ts`) does this automatically: a `401`
triggers one refresh, concurrent requests queue behind it, and the original
request is retried once with the new token. Login, logout, and refresh calls are
excluded — there is no useful refresh flow when the refresh itself is what
failed.

A refresh failure that is a **network** failure does not clear the session.
Only a rejected refresh token does.

### CORS

Requests without an `Origin` header (native mobile, curl) are always allowed.
Browser origins must be in `CORS_ORIGIN`, except in development where loopback
and private-LAN origins are accepted automatically. Credentials are allowed;
permitted headers are `Content-Type` and `Authorization`.

## Response envelope

Every endpoint returns one of two shapes.

**Success**

```jsonc
{
  "status": "success",
  "message": "Session ready",     // sometimes present
  "data": { }                     // endpoint-specific; may be null
}
```

**Failure**

```jsonc
{
  "status": "error",
  "message": "Add more detail before generating questions…",
  "errors": [ ],                  // present when field-level detail exists
  "stack": "…"                    // development only
}
```

Two legacy endpoints predate the envelope and return `success: true` instead of
`status: "success"`: `GET /health` and the per-module `/health` probes. They are
documented as-is in the OpenAPI file rather than quietly "corrected", because
monitoring may depend on the current shape.

## Errors

The rule, implemented in `app.js`:

> An error that named its own status said something deliberate about what the
> client should do, so its message is passed through. Anything reaching the
> handler without a status is a fault nobody anticipated, and its message is an
> internal detail — it becomes one flat line and the real text goes to the log.

So a `4xx` `message` is safe to show a user verbatim. A `500` message is always
`"Something went wrong on our end. Please try again."` — the detail is in the
server log.

This is not cosmetic. *"JWT issued at future"* is what a user was once shown for
a momentary clock difference between two machines at Supabase: a sentence that
describes internal plumbing, blames the user for it, and offers nothing to do
about it.

Controllers translate service failures deliberately. `POST /interviews/:id/turn`
maps "not found or access denied" to `404`, and "already completed" / "no source
material" / "written exam" to `400`, because the client shows these to the
candidate mid-interview and a session that cannot be continued has to read as a
refusal, not as a server fault.

## Status codes

Following [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110).

| Code | Meaning here |
| --- | --- |
| `200 OK` | Successful read or update |
| `201 Created` | Resource created — `/interviews/prepare`, `/exams/prepare` |
| `204 No Content` | Successful delete — `DELETE /users/me`, `DELETE /responses/:id` |
| `400 Bad Request` | Validation failure, unreadable document, material under 50 characters, action invalid for the current state |
| `401 Unauthorized` | Missing, malformed, or expired access token |
| `403 Forbidden` | Authenticated but not permitted |
| `404 Not Found` | Unknown route, or a resource the caller does not own — ownership failures are reported as `404`, not `403`, so the API does not confirm that someone else's id exists |
| `409 Conflict` | State conflict, e.g. signing up with an existing account |
| `422 Unprocessable Content` | Understood but not fulfillable — "Could not write enough exam questions" from thin material |
| `429 Too Many Requests` | Rate limit exceeded |
| `500 Internal Server Error` | Unanticipated fault. Message is always generic |
| `501 Not Implemented` | `DELETE /users/me` without `SUPABASE_SECRET_KEY` configured |

## Pagination

List endpoints take `page` and `limit` query parameters and return a
`pagination` object.

| Parameter | Default | Bounds |
| --- | --- | --- |
| `page` | `1` | ≥ 1 |
| `limit` | `10` (`20` on `/responses/sessions/:id`) | 1–100 |

```jsonc
{
  "status": "success",
  "data": {
    "data": [ /* items */ ],
    "pagination": { "page": 1, "limit": 10, "total": 42, "totalPages": 5 }
  }
}
```

`GET /history` also accepts `search` and `sort`:

| `sort` | Ordering |
| --- | --- |
| `recent` *(default)* | `started_at` descending |
| `oldest` | `started_at` ascending |
| `score_desc` | Best performance first |
| `score_asc` | Weakest first, for targeted review |

## Content types and uploads

`application/json` unless a file is attached. Body limit: 10 MB for JSON and
URL-encoded payloads.

| Endpoint | Field | Accepts |
| --- | --- | --- |
| `POST /job-descriptions` | `document` | Documents |
| `POST /interviews/prepare` | `document` | Documents |
| `POST /exams/prepare` | `document` | Documents |
| `POST /cv/sessions/:sessionId/tailor` | `cv` | Documents |
| `POST /speech/transcribe` | `audio` | Audio, ≤ 25 MB, one file |

**Document formats:** PDF, DOC, DOCX, ODT, RTF, TXT, MD, CSV, PPTX, ODP, XLSX,
ODS. Legacy binary `.ppt` and `.xls` are rejected with a message telling the
user to re-save as `.pptx` / `.xlsx`, because nothing maintained in Node can
extract text from them.

Format is resolved from the **filename extension first**, MIME type second.
React Native uploads frequently carry `application/octet-stream`: some Android
document providers report no type at all and the client fills in a placeholder
so the multipart body is well-formed. The filename survives that trip intact.

Document uploads have **no size ceiling**. Any figure tested turned away
ordinary course material — a slide deck carrying its images is several times the
size of the same content as a PDF. The bytes live in memory only for the length
of the request. Operators needing a limit should impose one at the reverse
proxy.

When posting multipart from a browser or React Native, do **not** set
`Content-Type` by hand — a manually written `multipart/form-data` header has no
boundary and multer rejects it.

## Rate limiting

`express-rate-limit` guards the sensitive auth paths. Exceeding a limit returns
`429`.

| Limiter | Applies to |
| --- | --- |
| `signupLimiter` | `POST /auth/signup`, `POST /auth/resend-verification` |
| `loginLimiter` | `POST /auth/login` |
| `passwordLimiter` | `POST /auth/forgot-password`, `/auth/reset-password`, `/auth/verify-password-reset-otp`, `/auth/change-password` |

## Health checks

| Endpoint | Envelope |
| --- | --- |
| `GET /health` | `{ success, message, timestamp }` — no `/api/v1` prefix |
| `GET /api/v1/auth/health` | `{ success, message }` |
| `GET /api/v1/users/health` | `{ success, message }` |
| `GET /api/v1/responses/health` | `{ status, message }` |
| `GET /api/v1/speech/health` | `{ status, message }` |
| `GET /api/v1/feedback/health` | `{ success, message }` |

Health probes require no authentication. Use `GET /health` for liveness.

## Endpoint index

### Authentication — `/api/v1/auth`

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/signup` | — | Register. Email confirmation depends on the Supabase setting |
| `POST` | `/login` | — | Authenticate |
| `POST` | `/refresh` | — | Exchange a refresh token for a fresh session |
| `POST` | `/forgot-password` | — | Send a reset email |
| `POST` | `/verify-password-reset-otp` | — | Verify the emailed OTP |
| `POST` | `/reset-password` | — | Set a new password with the token |
| `POST` | `/resend-verification` | — | Resend the confirmation email |
| `GET` | `/verify-email` | — | Confirm an address from the emailed link |
| `GET` | `/google` | — | Begin Google OAuth |
| `GET` | `/google/callback` | — | OAuth callback |
| `GET` | `/me` | ✅ | Current user |
| `POST` | `/change-password` | ✅ | Change password while signed in |
| `POST` | `/logout` | ✅ | End the session |

### Users — `/api/v1/users`

All require authentication.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/me` | Own profile |
| `PATCH` | `/me` | Update `full_name` |
| `PATCH` | `/me/status` | Set `is_active`. Does **not** invalidate the JWT |
| `PATCH` | `/me/complete-profile` | Mark the profile complete. Idempotent |
| `DELETE` | `/me` | Delete the account and all child data. `204`, or `501` without `SUPABASE_SECRET_KEY` |

### Job descriptions — `/api/v1/job-descriptions`

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/` | Create from pasted text or an attached `document` |
| `GET` | `/` | List own |
| `GET` | `/:id` | One |
| `PUT` | `/:id` | Replace |
| `DELETE` | `/:id` | Remove |

### Interviews — `/api/v1/interviews`

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/prepare` | **Primary entry.** Text or document → a session ready to interview. Returns no questions |
| `POST` | `/` | Create a session against an existing job description |
| `GET` | `/` | List sessions (paginated, searchable) |
| `GET` | `/:id` | Session detail with questions and responses |
| `POST` | `/:id/start` | Mark started |
| `POST` | `/:id/pause` | Pause |
| `POST` | `/:id/continue` | Resume |
| `POST` | `/:id/complete` | Complete |
| `POST` | `/:id/retake` | New session on the same material |
| `DELETE` | `/:id` | Delete |
| `POST` | `/:id/turn` | **The interview loop.** Returns the next question, or `done` |
| `POST` | `/:id/questions` | Bulk generate, outside the live loop |
| `POST` | `/:sessionId/questions/:questionId/answer` | Submit an answer |

`POST /:id/turn` accepts `mode`, `max_questions` (≤ 15), and `candidate_name`.
The server clamps `max_questions` to `MAX_SESSION_QUESTIONS = 15`. The response
carries `repeated: true` when the question was already outstanding — the client
is retrying a turn, not being given a new one.

### Exams — `/api/v1/exams`

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/prepare` | Text or document → a generated paper. The slowest request in the app |
| `GET` | `/:sessionId` | The paper as sat, including answers already given |
| `PUT` | `/:sessionId/answers/:questionId` | Record or change one selection |
| `POST` | `/:sessionId/submit` | Mark the paper and return the result |
| `GET` | `/:sessionId/result` | The marked paper |
| `POST` | `/:sessionId/retake` | A fresh paper on the same material |

Papers are 30 questions × 4 options. `GET /:sessionId` returns
`selected_option` per question so a closed app resumes exactly where it left
off, and never returns `correct_option` or `explanation` — those appear only
after submission.

### Questions — `/api/v1/questions`

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/generate` | Generate questions for a session |

### Responses — `/api/v1/responses`

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/sessions/:sessionId/questions/:questionId` | Submit or replace an answer |
| `GET` | `/sessions/:sessionId` | List answers (paginated, `include_feedback`) |
| `GET` | `/sessions/:sessionId/stats` | Completion metrics |
| `GET` | `/sessions/:sessionId/questions/:questionId` | One answer; `404` if unanswered |
| `GET` | `/:id` | One answer by id |
| `PATCH` | `/:id` | Correct a transcription. Refused on completed sessions |
| `DELETE` | `/:id` | Remove. Refused on completed sessions |

### Speech — `/api/v1/speech`

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/transcribe` | Upload audio (`audio` field, ≤ 25 MB) → transcript |
| `POST` | `/transcribe-url` | Transcribe from a URL |
| `POST` | `/synthesize` | Text → 24 kHz mono WAV. Headers `X-Voice`, `X-Character-Count` |
| `GET` | `/voices` | Voice catalogue |
| `GET` | `/formats` | Accepted audio MIME types |

`voice` accepts either a VoxPrep roster id (`m_measured_01`) or a catalogue key
(`orus`). Unknown values fall back to the default rather than erroring — a stale
voice id from an older build should still produce audio.

### Feedback — `/api/v1/feedback`

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/sessions/:sessionId/generate` | Batch-grade a finished session |
| `GET` | `/sessions/:sessionId/summary` | Aggregated session scores |
| `GET` | `/sessions/:sessionId` | Full per-question feedback |
| `POST` | `/responses/:responseId/regenerate` | Force-regrade one answer |
| `GET` | `/responses/:responseId` | Feedback for one answer |

Scores are integers 0–100 across relevance, completeness, technical accuracy,
clarity, and confidence. **A null score means the grader did not report that
dimension** and it is excluded from the average — not counted as zero.

### History — `/api/v1/history`

Covers reviewable sessions only (`completed` or `paused`).

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/` | Paginated list; `search`, `sort` |
| `GET` | `/stats` | Totals and average score |
| `GET` | `/:id` | Full detail: questions, responses, feedback |
| `PATCH` | `/:id/archive` | Toggle `is_archived` |
| `PATCH` | `/:id/notes` | Update notes |
| `DELETE` | `/:id` | Delete permanently |

### CV — `/api/v1/cv`

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/sessions/:sessionId/tailor` | Upload a CV (`cv` field) → rewritten against the job |
| `GET` | `/sessions/:sessionId` | Most recent tailored CV for a session |
| `GET` | `/:id` | One tailored CV |

The response carries the rewritten `document`, `tailoring_notes`,
`keywords_matched`, and `gaps`. The **extracted source text is never stored or
returned** — only `source_file_name` and `source_char_count`.

## Using the OpenAPI document

[`openapi.yaml`](openapi.yaml) is the machine-readable contract, written to
[OpenAPI 3.1.0](https://spec.openapis.org/oas/v3.1.0).

```bash
# Interactive documentation
npx @redocly/cli preview-docs docs/api/openapi.yaml

# Validate
npx @redocly/cli lint docs/api/openapi.yaml

# Generate a typed client
npx openapi-typescript docs/api/openapi.yaml -o frontend/types/api-generated.d.ts
```

It also imports into Postman, Insomnia, and Bruno for manual exploration.

> Any change to a request or response shape must update `openapi.yaml` in the
> same pull request. See
> [`CONTRIBUTING.md`](../../CONTRIBUTING.md#documentation-standards).
