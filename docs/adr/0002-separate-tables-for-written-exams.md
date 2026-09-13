# ADR-0002: Written exams get their own tables, sharing only the session

- **Status:** Accepted
- **Date:** 2026-08-21 *(the migration date; recorded retrospectively)*
- **Deciders:** VoxPrep maintainers

## Context

VoxPrep began as spoken practice only: `interview_questions` held questions, and
`user_responses` held what the candidate said. Adding written multiple-choice
exams introduced a second kind of question that shares almost nothing with the
first.

An exam question carries its own options and its own marking scheme. It is
answered by choosing rather than by speaking. It is marked arithmetically rather
than by a model. And the marking scheme must never be visible to a student
sitting the paper.

What the two kinds *do* share is the session: history, statistics, and the
dashboard should count an exam alongside an interview without knowing which is
which.

## Decision

Written exams get two new tables — `exam_questions` and `exam_answers` — and
reuse `interview_sessions` unchanged apart from one new column, `session_kind`
(`interview` | `exam`).

`exam_questions.options` is `JSONB`, not a child table.

## Options considered

### Option A — separate tables, shared session *(chosen)*

`interview_questions` stays exactly as it was. `exam_questions` carries
`options`, `correct_option`, `explanation`, and `topic`. `exam_answers` carries
`selected_option` and `is_correct`.

`session_kind` is the one bit that history and the dashboard read, and only in
order to route the user to the right review screen.

### Option B — add columns to `interview_questions`

Bolt `options`, `correct_option`, `explanation`, and `topic` onto the existing
table and use `question_type` to distinguish.

Rejected on two grounds. It puts four always-null columns on every interview
row — every session ever run, forever. And it gives the grader a second shape to
reason about: code reading a question would have to establish which kind it had
before it could trust any field. The withholding guarantee gets weaker too — a
mapper that must sometimes include `correct_option` and sometimes not is a
mapper that can be got wrong.

### Option C — a separate `exam_sessions` table as well

Full separation, no shared session.

Rejected because it duplicates every consumer. History, statistics, the
dashboard, and the retake flow would each need two queries and a merge, and the
two would drift. The session genuinely is the same concept: a user attempted
something, on some material, at some time, and scored something.

### Option D — a child table for options

Normalised `exam_options` rows.

Rejected because options are never queried, filtered, or joined on. They are
read and written as one unit with the question, always in full. A child table
buys nothing and costs a join on every read of every paper.

## Consequences

### Positive

- Interview rows carry no exam columns, and vice versa.
- The withholding guarantee is **structural**: `mapSittingQuestion` has no field
  for `correct_option` or `explanation`, which is stronger than remembering to
  delete them. `mapMarkedQuestion` adds them back after submission.
- History, statistics, and the dashboard count both kinds without change.
- A second written mode costs no new tables — callers branch on the mode's
  `format`, not on its id.

### Negative

- Two code paths for "a question in a session". Anything that genuinely spans
  both kinds must handle each explicitly.
- `session_kind` is a discriminator that every consumer of `interview_sessions`
  must be aware of, even if only to ignore it.
- `interview_sessions` is now a slightly awkward name for a table that also
  holds exams. Renaming it would touch every module for no functional gain.

### Neutral

- `exam_answers.is_correct` is written at marking time rather than derived on
  read, so the result keeps reporting the paper it was marked against even if a
  question is later corrected.

## Implementation

- `backend/migrations/2026-08-21_exams.sql`
- `backend/supabase_schema.sql`
- `backend/src/modules/exams/exam.mapper.js` — the sitting/marked split
- `backend/src/modules/interviews/modes.js` — `format`, `isWrittenMode`

## Revisiting

Reopen if a third question kind appears that is neither spoken nor
multiple-choice — a written long-form answer graded by a model, say. At three
kinds, a shared `questions` table with a discriminator and a JSONB payload may
cost less than three parallel sets of tables and mappers.
