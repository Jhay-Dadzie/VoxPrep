# ADR-0007: Unreported grading metrics are null and excluded from averages

- **Status:** Accepted
- **Date:** 2026-08-28 *(recorded retrospectively; the code predates this record)*
- **Deciders:** VoxPrep maintainers

## Context

Each spoken answer is graded across five dimensions: relevance, completeness,
technical accuracy, clarity, and confidence. Each is an integer 0–100, and the
overall score is their average.

`technical_accuracy_score` is **optional** in the assessment schema, and
correctly so. A grader reading an answer to "tell me about a time you handled a
disagreement" has no technical accuracy to assess, and routinely omits it.

The naive normalisation is `Number(value) || 0`. That turns `null`, `undefined`,
and `''` all into `0`.

## Decision

A metric the grader did not report is stored as **`null`**, not `0`, and is
**excluded** from the average rather than counted in it.

The scoring engine distinguishes two operations explicitly:

- `readScore(value)` — returns a clamped integer, or `null` for anything not
  reported. Never invents a number.
- `clampScore(value, fallback)` — forces a number, for the cases where one is
  genuinely required.

`meanOfReported(values)` filters nulls before averaging, and returns `null` when
nothing was reported.

## Options considered

### Option A — null, excluded from the average *(chosen)*

An unreported metric is *unknown*. Unknown is not zero, and the difference is
the whole point.

### Option B — treat unreported as 0

One line of code, no null handling anywhere downstream, and every score is
always a number — which simplifies the client.

Rejected because it is a **factual misstatement about the candidate**. Recording
a missing technical score as 0 asserts they scored nothing on technical
accuracy, and drags a five-metric average down by a fifth over a question that
was never technical to begin with. A candidate answering behavioural questions
well would see their overall score depressed by a dimension nobody assessed —
and would have no way to understand why.

### Option C — reweight to the reported metrics with fixed weights

Keep per-dimension weights and renormalise over whichever were reported.

Rejected as unnecessary. There is no evidence that clarity should count for more
than relevance, and inventing weights would introduce a judgement the product
cannot currently defend. An unweighted mean of the reported metrics is the
honest version. This remains the natural extension if weighting is ever
justified.

### Option D — require the grader to report all five

Force a number for every dimension.

Rejected because it does not remove the problem, it relocates it. A grader
compelled to produce a technical score for a behavioural answer will invent one,
and an invented number is worse than an absent one: it looks authoritative.

## Consequences

### Positive

- Scores state what was actually assessed.
- A behavioural answer is not penalised for not being technical.
- The distinction is enforced in one pure, dependency-free module, so it cannot
  drift between callers.
- Missing data is visible rather than disguised as a bad result — a screen can
  show "not assessed" instead of a misleading zero.

### Negative

- **Every consumer must handle null**: the database columns are nullable, the
  API schema types every score as `number | null`, and client code must render
  the absence.
- `overall_response_score` can itself be null, when nothing at all was reported.
- Two averages over different answers may be computed over different numbers of
  dimensions, so comparing them is not strictly like for like. This is honest
  but it is a subtlety.

### Neutral

- The same rule governs session and user aggregates, which roll up from
  `feedback` via database triggers and therefore inherit it automatically.

## Implementation

- `backend/src/modules/feedback/scoring.engine.js` — `readScore`, `clampScore`,
  `meanOfReported`
- `backend/src/modules/feedback/feedback.parser.js`
- `backend/supabase_schema.sql` — every score column nullable and range-checked
- `docs/api/openapi.yaml` — the `Score` schema
- `backend/src/modules/__test__/feedback.test.js`

## Revisiting

Reopen if per-dimension weighting is ever justified by evidence about what
predicts interview success. Option C is the path, and it does not require
reversing the null rule — a weighted mean over reported metrics works the same
way.
