# ADR-0004: Interview questions are generated per turn, not up front

- **Status:** Accepted
- **Date:** 2026-08-28 *(recorded retrospectively; the code predates this record)*
- **Deciders:** VoxPrep maintainers

## Context

The original design generated a full set of questions when a session was
prepared, stored them, and read them out one at a time.

That produces a questionnaire, not an interview. The thing that actually goes
wrong in a real interview is being asked a follow-up you did not plan for, about
a claim you made ninety seconds ago. A pre-written list cannot do that: question
seven was written before answer six existed.

It also front-loads all the cost and latency. The candidate waits for fifteen
questions to be written before hearing the first one, and every question is paid
for whether or not the session runs to completion.

## Decision

`POST /interviews/prepare` creates the session and the job description and
returns **no questions**. Each question is written at the moment it is needed —
by `POST /interviews/:id/turn` for the REST path, and by the agent's `think`
stage during a live voice session — against the transcript so far.

`prepareSessionValidation` continues to accept `questionCount` and ignores it.

Written exams are the deliberate exception: `POST /exams/prepare` generates the
whole paper, because a student sitting an exam expects a paper of known length
that does not change under them.

## Options considered

### Option A — per turn *(chosen)*

Each question sees the answers before it. Follow-ups are possible. Cost is
incurred only for questions actually asked.

### Option B — all questions at preparation time

Simple, and the whole session is knowable in advance — which makes it easy to
show a progress bar and to resume after a crash.

Rejected because it forecloses the product's central behaviour. It also puts the
worst latency at the worst moment: the candidate is waiting to start, with
nothing on screen, for a generation that scales with question count.

### Option C — generate the first question up front, the rest per turn

A hybrid: the first question is ready immediately, later ones adapt.

Rejected as complexity for a benefit the countdown screen already provides — the
client has a natural pause between "prepare" and "first question" in which to
generate one.

## Consequences

### Positive

- Questions respond to what the candidate actually said, including follow-ups
  and challenges to specific claims.
- Preparation is fast: no generation, so the setup screen returns quickly.
- Abandoned sessions cost only the questions that were asked.
- The question cap can be lowered mid-session by the client (`max_questions`,
  clamped server-side to 15) without wasting generated questions.

### Negative

- **Every turn pays a generation latency.** The voice path hides this by
  streaming the reply as it is produced; the REST path does not, and the client
  must show something during the wait.
- The total number of questions is not knowable in advance, so progress is
  reported as `asked` against `max_questions` rather than as a fixed list.
- A failed generation mid-interview must be recoverable. Hence `repeated: true`
  on a turn response: the question was already outstanding and the client is
  retrying, not being given a new one.
- Resuming a session requires replaying the transcript, not just reading a list.

### Neutral

- `mode` rides on every turn request rather than being stored on the session. It
  shapes the persona only, `interview_sessions` has no column for it, and a
  migration to persist a prompt detail was not judged worth the coupling.
- `POST /interviews/:id/questions` still exists for bulk generation outside the
  live loop. It is not on the interview path.

## Implementation

- `backend/src/modules/interviews/interview.controller.js` — `prepareSession`,
  `nextTurn`
- `backend/src/modules/interviews/interview.validation.js` — the ignored
  `questionCount`
- `backend/src/modules/agent/agent.prompt.js` — the live-session brief
- `backend/src/modules/exams/exam.controller.js` — the exception

## Revisiting

Reopen if per-turn latency becomes the dominant complaint on the REST path and
streaming cannot be applied there. Option C (generate the first question during
the countdown) is the cheapest partial fix and does not require reversing this
decision.
