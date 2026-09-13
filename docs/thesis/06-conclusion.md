# Chapter Six — Summary, Conclusion and Recommendations

## 6.1 Summary of the Work

This project set out to address a gap that is structural rather than
technological. Candidates preparing for high-stakes oral examinations can have
practice that is **available but unresponsive** — a question bank that cannot
react to anything they say — or practice that is **responsive but unavailable** —
a competent person, whose time is scarce and whose grading is inconsistent.
Neither rehearses the event the candidate will face.

Chapter Two established that this gap is not principally a limitation of
capability. The learning science is settled: deliberate practice with immediate,
specific, task-level feedback is what improves performance (Ericsson et al.,
1993; Hattie & Timperley, 2007), retrieval practice durably improves retention
(Roediger & Karpicke, 2006), and individualised tuition is the most effective
known instructional arrangement and does not scale by human means (Bloom, 1984;
VanLehn, 2011). The enabling technologies — robust speech recognition,
instruction-driven composition, distinguishable synthesis — are available as
commodity services. What was missing was the domain engineering that combines
them into a system which behaves correctly, assesses defensibly, and holds
sensitive material responsibly.

Chapters Three and Four supplied that engineering. The system was specified
against thirty-two functional and seventeen non-functional requirements,
designed as fourteen bounded modules behind a uniform anatomy, and implemented
as two deployables: an Express 5 REST and WebSocket API of approximately 16,000
lines of JavaScript over PostgreSQL with row-level security, and an Expo /
React Native client of approximately 13,200 lines of TypeScript serving iOS,
Android, and web.

Chapter Five verified it. All twenty-six must-have requirements are implemented
and traced to verifying tests; 471 of 473 automated cases pass, with the single
failure isolated, diagnosed as a stale assertion rather than a system defect, and
reported rather than removed. The chapter also specified — and stated as not yet
administered — the protocols by which responsiveness, usability, and assessment
validity are to be measured.

## 6.2 Contributions

The project makes four technical contributions and one methodological one. Each
is stated at the strength the evidence supports.

**C1 — Per-turn question composition against a live transcript.** Composing each
question at the moment of asking, rather than generating a set in advance, is
what makes an unscripted follow-up possible: a question that presses on a claim
the candidate made ninety seconds ago cannot be written before the claim exists.
It also confines inference cost to questions actually asked, and removes the
wait for a full question set before the first question is heard. The costs — per-
turn latency inside the conversational window, and a question set that cannot be
inspected in advance — are stated in §4.4.2 and recorded in ADR-0004.

**C2 — Server-enforced perceptual distinctness of a synthetic panel.** A panel
whose members share a voice is a panel of one wearing several names, and the
failure arises without any hostile client: a stale client sending identifiers a
catalogue no longer contains collapses two seats onto one default. Treating
distinctness as an invariant the server enforces against its catalogue —
resolving collisions rather than reporting them, and preferring a same-gender
substitute so a substitution does not silently re-cast a panelist — is a design
pattern the multi-party dialogue literature does not treat and which §5.3.3
verifies against adversarial input.

**C3 — Principled aggregation of partially reported assessment dimensions.**
Distinguishing "scored poorly" from "not applicable," propagating that
distinction as null through parsing, normalisation, aggregation, and display,
and excluding unreported dimensions from every average, prevents an arithmetic
accident from producing feedback at the least effective level Hattie and
Timperley identify. The automated-scoring literature assumes a complete rubric
applied to every response; systems built on instruction-following graders cannot
make that assumption, and this contribution addresses the resulting gap.

**C4 — A data-minimisation posture for sensitive source material.** Holding
extracted curriculum-vitae text in memory for the duration of a request and
discarding it — forfeiting cheap regeneration, easier support, and several
plausible future features — establishes that a system of this kind can operate
without accumulating the most damaging material it touches. Text never stored
cannot be disclosed by a misconfigured bucket, an over-broad query, or a backup
restored to the wrong place.

**C5 — A documented, tested reference design, with its evaluation instruments.**
The system is accompanied by seven Architecture Decision Records that state each
position, the alternatives rejected, and the consequences accepted, recorded at
the time rather than reconstructed. Chapter Five additionally specifies a
concrete assessment-validity instrument — stratified sampling, blind independent
human re-grading, weighted κ against a human–human baseline, and a fairness
sub-analysis — for a class of system where evaluation practice remains
notably weaker than capability. The instrument is offered as a contribution
independently of this project's having administered it.

## 6.3 Conclusion

The aim stated in §1.3.1 was to design, implement, and evaluate a platform
delivering the responsiveness of human role-play with the availability of a
static question bank. All seven objectives were pursued: O1 through O6 are
discharged and verified; O7 is discharged for functional correctness and
specified but not administered for the empirical measures.

The five research questions are answered as follows.

**RQ1 (conversational latency).** Answered affirmatively at the level of design
and development-time observation, and *not* at the level of measurement. The
architecture supports conversational turn-taking — frame-by-frame relay in both
directions makes time-to-first-audio, rather than time-to-completion, the
quantity the candidate perceives — and the system was observed to sustain it on
device during cycle 3, which is the basis on which the project proceeded. The
thresholds in NFR-01 have not been measured against, and §5.5.1 specifies how.

**RQ2 (panel distinctness).** Answered in its engineering half and open in its
perceptual half. The guarantee required is that distinctness be an invariant the
server enforces against its own catalogue rather than a property it trusts from
the client, and §5.3.3 verifies that it holds against duplicate identifiers,
unknown identifiers, absent rosters, and oversized requests. Whether the
resulting panel is *perceived* as several people rests on informal listening;
§5.6.2 specifies the attribution measure that would settle it.

**RQ3 (aggregation of partial assessments).** Answered. Unreported dimensions
must be recorded as unknown and excluded from averages, never recorded as zero,
because the two mean opposite things to the candidate: one is silence about a
dimension that did not apply, the other is an assertion of total failure on it.
The rule is implemented as a pure, exhaustively tested engine and verified to
hold from parsing through to display.

**RQ4 (assessment validity).** **Not answered.** The system produces
per-dimension assessments that read plausibly; whether they agree with expert
human judgement is unknown. This report does not claim otherwise, and §5.7
specifies the measurement that would answer it.

**RQ5 (data minimisation).** Answered. A system processing curricula vitae can
operate without persisting their extracted text. The functionality forfeited is
real, was weighed, and is enumerated in §4.8.4.

The bounded conclusion the evidence supports is this: **VoxPrep is functionally
correct against its specification, its four distinguishing design positions are
implemented as designed and hold under adversarial input, and its
responsiveness, usability, and assessment validity remain to be measured by the
protocols this report specifies.** That is a smaller claim than the system's
behaviour in use might invite, and it is the claim the evidence carries.

## 6.4 Limitations

**L1 — Assessment validity is unmeasured.** The most significant limitation. No
agreement study between machine and human graders has been conducted, and until
one is, the numeric feedback should be understood as an aid to direct further
practice rather than as a measurement of ability.

**L2 — Construct validity of the confidence dimension.** `confidence_score` is
inferred from transcript features — hedging, sentence completion, answer length —
not from vocal affect and certainly not from psychological state. It carries a
foreseeable fairness hazard: features that read as low confidence correlate with
non-native English usage and with culturally variable speech norms, independent
of command of the material. §5.7 specifies the sub-analysis, and the dimension
should be suppressed rather than displayed if the analysis finds a systematic
gap.

**L3 — Usability and latency are unmeasured in the field.** Development-time
observation on the developer's own devices and network is not evidence about
users on theirs.

**L4 — Dependence on external services.** The system owns no model and no speech
stack. This was the correct scoping decision (§1.6) and it accepts real risk:
the system's behaviour can change without any change to its code, an interface
or pricing change can require rework, and a service withdrawal would disable the
spoken modes entirely. The voice-indirection layer (§4.8.5) mitigates one
instance — a synthesis vendor change cost one server file and no client release —
but does not generalise to the composition provider.

**L5 — English only.** Neither generation quality nor recognition accuracy has
been evaluated outside English. Nothing in the architecture forecloses other
languages, but nothing establishes them either.

**L6 — Modality.** The system assesses what was said, not how the candidate
appeared. Eye contact, posture, and affect are legitimate interview skills
outside its scope.

**L7 — Known technical debt.** Four items are outstanding and stated rather than
concealed.

`technical_accuracy_score` is stored packed into a JSON-bearing text column
rather than as a first-class column (§4.5.4) — it works and is tested, but it is
a typed value stored untyped, invisible to database constraints and unavailable
to SQL aggregation.

One test asserts a pre-envelope response shape and consequently fails (§5.3.2);
the defect is in the test, and it was left in place so that the figure reported
in Chapter Five is the figure that was measured.

The **sign-in rate limit is set too permissively for the threat it was adopted
against** (§5.8): 100 attempts per address per fifteen minutes bounds resource
consumption but does not meaningfully impede credential stuffing. The mechanism
is correct and correctly wired; the value is not, and NFR-11 should be regarded
as only partially satisfied until it is corrected.

`core/middleware/rateLimit.middleware.js` is an empty file left behind when the
limiters were placed in the auth module. Harmless at runtime, but it invites a
reader to conclude the protection is absent.

**L8 — Single-developer evaluation of design positions.** The four design
positions were argued and recorded at the time they were taken, which is better
than reconstruction, but they were not subjected to independent architectural
review.

## 6.5 Recommendations for Future Work

### 6.5.1 Immediate — completing the evaluation

These close the gap between what the system does and what has been shown about
it, and should precede any further feature work.

1. **Administer the assessment-validity study (§5.7).** 100 stratified responses,
   two blind independent raters, quadratic-weighted κ reported against a
   human–human baseline, with the fairness sub-analysis by first language. This
   is the single most valuable outstanding piece of work.
2. **Administer the usability study (§5.6)** with at least 20 participants,
   including the panel-attribution measure that would settle RQ2's perceptual
   half.
3. **Instrument and measure latency (§5.5.1)** across 300 turns, separating the
   system's own relay overhead from upstream components so the result is
   actionable.
4. **Correct the sign-in rate limit** (§5.8). Separate the two concerns the
   single limiter currently conflates: keep a permissive per-address ceiling for
   resource consumption, and add a much lower per-account ceiling with
   exponential backoff for credential guessing. This is the only finding in this
   report that leaves a stated security requirement unmet.
5. **Discharge the remaining technical debt in L7**: migrate
   `technical_accuracy_score` to a first-class column with the constraint its
   siblings carry, correct the stale test assertion, and delete the empty
   `rateLimit.middleware.js`.
6. **Commission a dependency-vulnerability scan and an independent security
   review**, neither of which has been performed.

### 6.5.2 Near term — strengthening what exists

7. **Continuous integration** running the suite on every push, with coverage
   reporting, so that a regression is caught by the pipeline rather than by a
   developer remembering to run it.
8. **Adaptive difficulty.** The system currently composes each question against
   the transcript but does not modulate difficulty against demonstrated
   performance. Ericsson's framework requires practice at the edge of current
   ability; a session that stays comfortable is not deliberate practice.
9. **Longitudinal progress modelling.** Per-dimension trends across sessions
   would answer "am I improving on clarity?", which is the question a candidate
   returning for a fifth session actually has.
10. **Provider abstraction for composition**, generalising the voice-indirection
   pattern of §4.8.5 to the language model, which would reduce L4 and permit
   comparative evaluation of providers on the same sessions.
11. **Offline written examinations.** Papers are generated server-side but sat
    entirely client-side; caching a generated paper for offline sitting would
    make the retrieval-practice mode usable without connectivity, which matters
    disproportionately for the users this project is most intended to serve.

### 6.5.3 Longer term — research directions

12. **Fairness auditing at scale.** L2 identifies a hazard and §5.7 specifies a
    sub-analysis; a properly powered differential-item analysis across first-
    language and accent groups is a research contribution in its own right and
    a precondition for any summative use of this class of system.
13. **Efficacy against outcomes.** The strongest possible evaluation is whether
    candidates who practise with the system perform better in real examinations
    than a matched control. It is also the hardest — outcomes are confounded,
    delayed, and unevenly observable — and it is the study the field most needs.
14. **Multilingual operation**, beginning with an evaluation of recognition and
    composition quality in the languages the target population actually
    interviews in.
15. **Non-verbal channels**, approached with the caution L6 and §1.6 record:
    inferring affect from video raises accuracy and fairness problems that would
    have to be answered before the capability was offered, not after.

---

**Previous:** [Chapter Five](05-testing-and-evaluation.md) · **Next:** [References](references.md)
