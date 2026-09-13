# Chapter One — Introduction

## 1.1 Background to the Study

A great deal turns on a single conversation. Employment offers, doctoral awards,
and permission to enter a country are all decided in an oral examination lasting
between twenty minutes and two hours, conducted by strangers, and scored against
criteria the candidate cannot see. The stakes are asymmetric: the examiners do
this routinely, the candidate perhaps three or four times in a lifetime.

Preparation, unsurprisingly, is where candidates try to close that asymmetry.
The pedagogical basis for doing so is well established. Ericsson, Krampe and
Tesch-Römer (1993) showed that expert performance across domains is predicted
not by accumulated experience but by *deliberate practice* — repeated,
effortful attempts at a task, undertaken at the edge of current ability, with
immediate and specific feedback. Hattie and Timperley (2007), synthesising a
large body of educational research, found feedback to be among the strongest
single influences on achievement, but with a critical qualification: its effect
depends almost entirely on whether it tells the learner *where to go next*
rather than merely how they did. Bloom (1984) demonstrated that one-to-one
tutoring moves the average learner roughly two standard deviations above
conventional group instruction — the celebrated "2 sigma problem," whose framing
is precisely that individual tuition works and does not scale.

Interview preparation is deliberate practice in Ericsson's sense, and it suffers
exactly Bloom's scaling problem. The practice that works is a competent person
sitting opposite you, asking questions you did not anticipate, and telling you
afterwards what specifically was weak. That person is expensive, is not
available at 2 a.m. the night before, and — if they are a friend rather than a
trained interviewer — grades inconsistently or not at all.

Two categories of tool have grown up in the gap, and each solves half of the
problem.

**Question banks** — curated lists of "tell me about a time when…", searchable
by role and industry — are always available and cost nothing. They are also
inert. A list cannot ask a follow-up, because question seven was written before
answer six existed. What they rehearse is *recall of prepared material*, which
is not the skill an interview tests. The failure mode candidates report is
recognisable: fluent delivery of a rehearsed answer, followed by collapse when
the interviewer says "you mentioned you led that migration — what would you do
differently?"

**Role-play** — with a peer, a career-services adviser, or a paid coach — does
ask follow-ups, because a person is doing the asking. It is bounded by that same
person's availability, and by their domain competence: a friend who has never
worked in embedded systems cannot press on a claim about interrupt latency, and
a careers adviser cannot examine a thesis on stochastic optimisation. Nor is it
consistently scored. Encouragement is what friends offer; a rubric is what an
examiner applies.

Meanwhile the technical preconditions for automating the missing half have
changed materially. Transformer-based language models (Vaswani et al., 2017) and
the demonstration that sufficiently large models perform novel tasks from
instructions alone (Brown et al., 2020) made it feasible to compose a question
against a specific transcript rather than retrieve one from a list. Large-scale
weakly-supervised speech recognition (Radford et al., 2022) brought transcription
of unconstrained conversational speech within reach of commodity APIs, and
neural speech synthesis reached the point where several synthetic voices in one
conversation are distinguishable as different people rather than as one voice
with different labels.

This project asks what a preparation tool looks like when those three
capabilities — composition, recognition, and synthesis — are treated as
available infrastructure and the engineering effort is spent on the domain
instead: on what a practice session *is*, on how a panel of examiners behaves,
on what makes a generated question markable, and on what a candidate is told
when it is over.

## 1.2 Statement of the Problem

Candidates preparing for high-stakes oral examinations have access either to
practice that is **available but unresponsive**, or to practice that is
**responsive but unavailable**. Neither rehearses the event they will actually
face.

Four specific deficiencies follow from this, and together they constitute the
problem this project addresses.

**First, practice material is generic where the examination is specific.** A
candidate holds the exact source material the examination will be drawn from —
the job description, the thesis, the visa application, the syllabus — yet
question banks are organised by role or subject and cannot use it. The
consequence is that preparation covers the domain in general and the examination
in particular only by coincidence.

**Second, unscripted follow-up is unrehearsed.** The moment a candidate is least
prepared for is a probe into a claim they themselves made a minute earlier. No
pre-generated question set can produce it, because such a question is a function
of an answer that does not yet exist at generation time.

**Third, a panel is not a person.** Doctoral vivas, consular interviews, and
senior technical hiring are frequently conducted by two to four examiners who
interrupt each other, hold different concerns, and hand the floor back and
forth. Practising against a single interlocutor does not rehearse the
disorientation of being questioned from an unexpected direction by an unexpected
voice.

**Fourth, feedback is absent, vague, or unequally applied.** Where feedback
exists at all it tends toward a global impression — "that was good, be more
confident" — rather than dimension-by-dimension judgement a candidate can act
on, which is exactly the distinction Hattie and Timperley (2007) identify as
determining whether feedback improves performance.

To these four the project adds a fifth, arising from the domain rather than the
pedagogy. A system of this kind necessarily handles **material of unusual
sensitivity**: a curriculum vitae assembles employment history, home address,
telephone number, and often date of birth and nationality into a single
document, and a visa application is more sensitive still. Any solution must
treat that material as a liability to be minimised rather than an asset to be
accumulated.

## 1.3 Aim and Objectives

### 1.3.1 Aim

To design, implement, and evaluate a mobile platform that converts material
supplied by a candidate into responsive, graded practice for high-stakes oral
and written examinations, delivering the responsiveness of human role-play with
the availability of a static question bank.

### 1.3.2 Specific Objectives

The aim is decomposed into seven objectives, each of which is discharged in an
identified part of this report and verified in Chapter 5.

| # | Objective | Discharged in | Verified by |
| --- | --- | --- | --- |
| **O1** | To elicit and specify the functional and non-functional requirements of a candidate-facing interview and examination practice system. | §3.3–3.5 | §5.4 |
| **O2** | To design a system architecture that ingests arbitrary user-supplied source material and derives practice from it, across both spoken and written modalities. | §3.7–3.8 | §5.4 |
| **O3** | To implement a full-duplex spoken interview in which each question is composed at the moment of asking against the accumulated transcript, thereby supporting unscripted follow-up. | §4.4 | §5.3.2, §5.4 |
| **O4** | To implement a multi-member examining panel whose members are reliably distinguishable by voice, and to establish server-side guarantees of that distinctness. | §4.4.3 | §5.3.3 |
| **O5** | To implement automated assessment producing per-dimension, per-answer feedback, and a defensible aggregation of those dimensions into session-level scores. | §4.5 | §5.3.4, §5.7 |
| **O6** | To implement a written multiple-choice examination generated from the same source material and marked deterministically against a stored scheme. | §4.6 | §5.3.5 |
| **O7** | To evaluate the resulting system for functional correctness, responsiveness, usability, assessment validity, and security. | Chapter 5 | — |

## 1.4 Research Questions

The objectives are pursued in answer to five questions.

**RQ1.** Can a practice interview in which every question is composed at the
moment of asking be delivered within the latency tolerance of natural spoken
conversation, given that composition, recognition, and synthesis must all occur
between the candidate finishing an utterance and the interviewer beginning one?

**RQ2.** What server-side guarantees are required for a synthetic examining
panel to be perceived as several distinct people rather than one voice under
several names, and can those guarantees be enforced without trusting the client?

**RQ3.** How should per-dimension machine-generated assessments be aggregated
into a session score when the grader legitimately declines to report some
dimensions on some answers?

**RQ4.** Does automated per-answer feedback derived from user-supplied source
material agree with expert human judgement to a degree sufficient to be useful
for preparation?

**RQ5.** What data-minimisation posture is achievable for a system that must
process curricula vitae and visa material, and what functionality is forfeited
by adopting it?

RQ1, RQ2, RQ3 and RQ5 are answered by the design and implementation reported in
Chapters 3 and 4 and verified in Chapter 5. RQ4 is an empirical question whose
measurement instrument is specified in §5.7 and whose administration is
identified in §6.4 as outstanding work.

## 1.5 Scope of the Study

The study covers the complete design, implementation, and verification of a
two-deployable system:

- an **application programming interface** exposing versioned REST resources and
  a WebSocket voice gateway, implemented in Node.js and backed by a relational
  database with authentication, storage, and row-level access control;
- a **cross-platform mobile client** for iOS, Android, and the web, implemented
  in React Native, covering the full user journey from registration through
  session preparation, live interview or written examination, feedback review,
  history, and optional curriculum-vitae tailoring.

Four practice modes are within scope: `job_interview`, `viva_defense`, and
`visa_interview` (spoken), and `exam` (written). Twelve document formats are
accepted for source material. Assessment covers five dimensions — relevance,
completeness, technical accuracy, clarity, and confidence — each on a 0–100
scale.

## 1.6 Delimitations and Assumptions

The following are deliberately excluded, with reasons.

**Model training is out of scope.** Language understanding, generation, speech
recognition, and speech synthesis are consumed as managed services. The
contribution of this work lies in the domain layer — session semantics, panel
behaviour, markability, assessment aggregation, and data minimisation — not in
model development. Training a competitive model is neither feasible within an
undergraduate project's resources nor necessary to answer the research
questions.

**Video and non-verbal analysis are out of scope.** Eye contact, posture, and
facial affect are legitimate interview skills, but inferring them from a
front-facing camera raises accuracy and fairness problems disproportionate to
the project's scope, and would substantially widen the privacy surface discussed
in §3.11.

**Multilingual operation is out of scope.** The system operates in English.
Nothing in the architecture forecloses other languages — mode personas and voice
catalogues are data — but neither generation quality nor recognition accuracy has
been evaluated outside English.

**Recruiter- and institution-facing functionality is out of scope.** The system
serves the candidate. There is no employer console, no cohort dashboard, and no
mechanism by which a third party observes a candidate's sessions.

Three assumptions are made and stated so that a reader can judge where the work
would not transfer. It is assumed that (i) the candidate has intermittent
broadband or mobile data of sufficient quality to sustain a duplex audio stream
— the system degrades to the written examination mode where this does not hold;
(ii) source material supplied by the candidate is in a machine-extractable
format rather than, for instance, a photograph of a printed page; and (iii) the
external inference services remain available under their published interfaces,
a dependency whose risk is analysed in §6.4.

## 1.7 Significance of the Study

**For candidates,** the system makes responsive, graded interview practice
available at the hour it is wanted, against the specific material the
examination will draw on, at a marginal cost far below that of coaching. The
significance is largest for candidates whose networks do not contain someone
competent to examine them in their field — which correlates strongly with
exactly the groups for whom the interview is the principal remaining barrier.

**For the discipline,** the report contributes a documented, tested reference
design for a class of system now being widely built and rarely written up:
real-time multi-party voice agents backed by a conventional relational
application. Four design positions are argued from evidence rather than
asserted — per-turn generation (§4.4.2), server-enforced voice distinctness
(§4.4.3), null-not-zero score aggregation (§4.5.3), and non-persistence of
extracted sensitive text (§4.8.4) — and each is recorded as an Architecture
Decision Record with the alternatives that were rejected and why.

**For subsequent research,** the assessment-validity protocol in §5.7 offers a
concrete instrument — stratified sampling of graded responses, blind independent
human re-grading, and agreement measured by Cohen's κ — for evaluating
machine-generated formative assessment, an area where evaluation practice
remains notably weaker than capability.

## 1.8 Definition of Operational Terms

The system's vocabulary is defined here as this report uses it; where a term has
a narrower meaning here than in general usage, the difference is stated. The
complete domain vocabulary appears in [`docs/glossary.md`](../glossary.md).

**Table 1.1 — Operational definitions of domain terms**

| Term | Definition as used in this report |
| --- | --- |
| **Session** | One instance of practice, spoken or written, from preparation to completion. Persisted as a row in `interview_sessions` and discriminated by `session_kind`. |
| **Agent** | The live voice interviewer: a duplex service bundling recognition, composition, and synthesis behind one WebSocket. Distinct from "AI agent" in the tool-calling sense. |
| **Panel** | The set of one to four synthetic interviewers seated for a spoken session. Seat 0 is the **chair**. |
| **Turn** | One question-and-answer exchange. The unit of both floor rotation and question composition. |
| **Response** | A candidate's *spoken* answer, persisted in `user_responses`. A written selection is an **exam answer** (`exam_answers`); the report never uses "answer" unqualified. |
| **Assessment** | The model's evaluation of one response, before normalisation. Becomes a **feedback** row once normalised. |
| **Mode** | A practice type (`job_interview`, `viva_defense`, `visa_interview`, `exam`) carrying a persona, a question mix, and generation rules. The persona is held server-side only. |
| **Preparation** | Creating a session from source material. For spoken modes it generates *no* questions; for `exam` it generates the whole paper. |
| **Reported metric** | A grading dimension the model actually returned a usable value for. Distinguished throughout from an unreported one, which is null and excluded from averages — never zero. |
| **Envelope** | The uniform response wrapper `{ status, message, data }`. |

## 1.9 Organisation of the Report

**Chapter Two** reviews the literature: the theoretical framework drawn from
deliberate practice, feedback, and retrieval-practice research; work on
conversational agents and spoken dialogue systems; automated assessment;
existing commercial and academic interview-preparation systems; and the
architectural foundations the implementation rests on. It closes by identifying
the gap the project occupies.

**Chapter Three** presents the methodology and design: the iterative-incremental
process adopted, requirements elicitation, the functional and non-functional
requirements, use-case analysis, the architecture in C4 views, the database
design with its access-control model, the interface design, the voice protocol,
and the security design.

**Chapter Four** documents the implementation: technology selection and
justification, backend module realisation, the live voice subsystem, the
generation and grading subsystem, the written examination subsystem, the client,
cross-cutting concerns, and the substantive challenges encountered with their
resolutions.

**Chapter Five** reports testing and evaluation: the testing strategy, the
automated suite and what it establishes, traceability from requirements to
verifying tests, and the specified protocols for latency, usability,
assessment-validity, and security evaluation, followed by discussion.

**Chapter Six** summarises the work, states its contributions and limitations
without overclaim, and recommends future work.

---

**Previous:** [Front Matter](00-front-matter.md) · **Next:** [Chapter Two — Review of Related Literature](02-literature-review.md)
