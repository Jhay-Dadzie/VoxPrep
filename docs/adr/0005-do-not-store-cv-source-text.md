# ADR-0005: Extracted CV text is never persisted

- **Status:** Accepted
- **Date:** 2026-08-20 *(the migration date; recorded retrospectively)*
- **Deciders:** VoxPrep maintainers

## Context

CV tailoring is offered at the end of an interview, because the job description
is already on file. The candidate uploads a CV, the server extracts its text,
and a model rewrites it against the job.

That extracted text is the most sensitive material this product touches. A CV
carries full employment history, home address, phone number, and often date of
birth and nationality — assembled in one place, which is precisely what makes it
valuable to an attacker and damaging to leak.

The obvious thing to do is store it. It would make regeneration cheaper, support
easier, and future features — comparing two tailorings, re-running with a
different model — straightforward.

## Decision

The extracted text is held in memory for the duration of the request and then
discarded. `tailored_cvs` stores the **rewritten** document, plus
`source_file_name` for display and `source_char_count` for support and
diagnostics.

The uploaded file itself is never written to disk either: uploads use multer's
memory storage.

## Options considered

### Option A — do not store it *(chosen)*

Nothing downstream needs the source text once the model has read it. Data that
does not exist cannot be leaked, subpoenaed, mis-permissioned, or accidentally
included in an export.

### Option B — store it, protected by row-level security

Standard practice, and RLS is already in place on every other user table.

Rejected because RLS is not the primary control in this system — the API reads
through the service-role client, which bypasses it. The real protection for
stored CV text would be the correctness of every future query touching that
table. That is a guarantee that decays: it holds today and depends on every
subsequent change holding it too.

### Option C — store it encrypted at rest, with a separate key

Stronger, and defensible.

Rejected as buying little for its cost. The application must be able to decrypt
it to use it, so a compromised application still yields plaintext. It adds key
management, rotation, and a recovery story, to protect data the product does not
need.

### Option D — store it with a short retention window

Keep it for 24 hours to allow regeneration, then delete.

Rejected because retention jobs are a category of thing that silently stops
running. A deletion that depends on a cron job being healthy is a deletion that
may not have happened, and nobody notices until it matters.

## Consequences

### Positive

- The most sensitive field in the product does not exist in the database.
- Nothing to leak in a backup, an export, a support query, or a breach.
- Simplifies the privacy disclosure and any future data-subject request: there
  is no CV text to produce or erase.
- No encryption keys, no retention job, no deletion guarantee to prove.

### Negative

- **Regeneration requires re-uploading the CV.** There is no server-side path to
  re-run a tailoring against the same source.
- Support cannot inspect what the model actually read. `source_char_count` is
  the only signal that extraction worked, which is thin — it distinguishes
  "empty" from "not empty" and nothing else.
- Features that compare two tailorings of the same CV, or diff a tailoring
  against the original, are not possible without changing this decision.

### Neutral

- The same reasoning applies to job-description and course-material uploads, but
  those *are* stored (`job_descriptions.job_content`) because the session
  depends on them: questions are generated against that text repeatedly, and a
  retake needs it. The asymmetry is intentional — necessity, not sensitivity, is
  what decides.

## Implementation

- `backend/migrations/2026-08-20_tailored_cvs.sql` — the table, and the comment
  explaining the absence
- `backend/supabase_schema.sql`
- `backend/src/modules/cv/cv.service.js`
- `backend/src/core/middleware/upload.middleware.js` — memory storage

## Revisiting

Reopen only if a feature genuinely requires the source text and cannot be served
by re-uploading. If it is reopened, Option C (encrypted at rest with a distinct
key) becomes the minimum bar, not Option B.
