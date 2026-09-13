# Chapter Two — Review of Related Literature

## 2.1 Introduction

This chapter establishes the intellectual foundation on which VoxPrep is built
and locates the project within existing work. It proceeds from theory to
practice: §2.2 sets out the learning-science framework that justifies the
system's central design commitments; §2.3 reviews conversational and spoken
dialogue systems; §2.4 examines automated assessment and feedback generation;
§2.5 surveys existing interview-preparation systems against a comparison
framework; §2.6 covers the software-architecture and documentation foundations
the implementation adopts; and §2.7 states the gap.

> **Note to the author.** The references cited here are genuine and
> well-established, but you must retrieve and read each one before submission,
> and reformat every entry into the citation style your department mandates
> (APA 7th, IEEE, and Harvard are the usual candidates). An examiner who finds
> a citation you cannot discuss is a serious problem; an examiner who finds one
> that does not say what you claimed is a fatal one. Where §2.5 compares
> commercial products, verify each product's current feature set at the time of
> writing and cite the date of access — these change frequently.

## 2.2 Theoretical Framework

Three bodies of work supply the theory that the system's design is answerable
to. Each yields a specific, testable design commitment rather than general
motivation.

### 2.2.1 Deliberate practice

Ericsson, Krampe and Tesch-Römer (1993), studying expert musicians, found that
attained performance was predicted by accumulated hours of *deliberate
practice* — activity specifically designed to improve performance, undertaken at
the limit of current ability, repeated, and accompanied by immediate feedback —
rather than by experience or by unstructured repetition. The distinction matters
here because it separates two things a preparation tool might do. Reading a list
of likely interview questions is experience. Attempting an answer, having it
probed, and being told precisely where it was thin is deliberate practice.

The framework's requirement of *effortful attempts at the limit of current
ability* is what disqualifies a static question bank: a fixed list does not
adapt its difficulty or direction to what the learner just demonstrated. It is
the primary theoretical justification for per-turn question generation (ADR-0004,
§4.4.2), where each question is a function of the transcript so far and can
therefore press on precisely the claim the candidate made least convincingly.

### 2.2.2 The nature of effective feedback

Hattie and Timperley (2007) synthesised evidence across a very large number of
studies and concluded that feedback is among the most powerful influences on
achievement — but with variance so wide that some feedback demonstrably harms
performance. Their model distinguishes feedback at four levels (task, process,
self-regulation, and self) and finds the *self* level — praise directed at the
person — to be the least effective, while feedback that answers "Where am I
going? How am I going? Where to next?" at the task and process levels is the
most effective.

This has a direct architectural consequence. It rules out a single global
"score out of 10" as the feedback product, and requires instead per-dimension
judgement attached to specific answers, with explicit strengths and
improvements. The five-dimension schema implemented in §4.5 — relevance,
completeness, technical accuracy, clarity, confidence — together with per-answer
`strengths` and `improvements` arrays, is a direct operationalisation of the
task- and process-level feedback Hattie and Timperley identify as effective.

It also creates the aggregation problem addressed by RQ3. Per-dimension feedback
is only honest if the system distinguishes "scored poorly on technical accuracy"
from "technical accuracy was not applicable to this answer." Collapsing the
second into the first produces feedback at the *self* level in disguise — a
depressed average the candidate cannot act on — and is the reason for the
null-not-zero rule (ADR-0007, §4.5.3).

### 2.2.3 Retrieval practice and the testing effect

Roediger and Karpicke (2006) demonstrated that retrieving information from
memory produces more durable retention than re-studying the same material for an
equivalent period — the *testing effect* — and that the advantage grows with
delay. The finding reframes assessment as an intervention rather than a
measurement: a test is not merely how you find out what was learned, it is part
of how learning happens.

This is the justification for the written examination mode existing alongside
the spoken one rather than as an afterthought. For material where recall is what
must be secured — a syllabus, the substantive content underlying a viva — a
thirty-question paper generated from that material is a retrieval-practice
intervention, and the per-question explanations returned at marking supply the
corrective feedback that Roediger and Karpicke found necessary for the effect to
be maximised.

### 2.2.4 The scaling problem

Bloom (1984) reported that students taught one-to-one with mastery-based
correction performed approximately two standard deviations above conventionally
taught students, and framed the resulting challenge — finding group methods that
approach individual tuition's effect — as the "2 sigma problem." VanLehn (2011),
reviewing several decades of subsequent work, found that step-based intelligent
tutoring systems in fact approach human tutoring more closely than Bloom's
figure implied, with the effect size gap between human tutors and good ITSs
being considerably smaller than that between either and no tutoring.

VanLehn's finding is the empirical warrant for this class of project. The
relevant comparison for VoxPrep is not "is it as good as a skilled interview
coach" but "is it materially better than the alternative the candidate actually
has," which for most candidates is a question bank and a supportive friend.

## 2.3 Conversational Agents and Spoken Dialogue Systems

### 2.3.1 From pipelines to end-to-end systems

Classical spoken dialogue systems were assembled as a pipeline: automatic speech
recognition, natural-language understanding, dialogue state tracking, dialogue
policy, natural-language generation, and speech synthesis, each a separately
trained component with its own error profile. Jurafsky and Martin's standard
treatment sets out this architecture and its characteristic failure — error
propagation, where a recognition mistake in stage one produces a confident and
irrecoverable misunderstanding in stage four.

Two developments have collapsed this pipeline. Radford et al. (2022) showed that
a single model trained on a very large, weakly supervised multilingual corpus
approaches human robustness on unconstrained speech without dataset-specific
fine-tuning, largely removing recognition as the limiting component for
conversational English. Concurrently, instruction-following language models
(Brown et al., 2020) absorbed understanding, state tracking, policy, and
generation into one component driven by a natural-language specification of the
task, removing the separately engineered dialogue manager that constituted the
bulk of a classical system's development cost.

VoxPrep is built on the far side of that collapse. Its voice subsystem consumes
a service that bundles recognition, composition, and synthesis behind a single
duplex socket (§4.4). What remains for the application to own is not dialogue
management in the classical sense but *dialogue governance*: who holds the
floor, when the interview ends, what is persisted, and what the candidate is
permitted to be told at each stage.

### 2.3.2 Latency and the perception of conversation

Nielsen (1993) established three response-time thresholds that have proved
durable: approximately 0.1 s for an interaction to feel instantaneous, 1 s to
preserve uninterrupted flow of thought, and 10 s as the limit of attention
without explicit progress indication. Conversational speech imposes a tighter
constraint still — human turn-taking gaps cluster around 200 ms, and gaps
substantially beyond that are heard not as processing delay but as social
signal: hesitation, disapproval, or a failure to understand.

This is the sharpest technical constraint on the system and the substance of
RQ1. Recognition, composition, and synthesis must complete within the window
between the candidate finishing an utterance and the interviewer beginning one,
or the interviewer stops sounding like an interviewer. It motivates two
implementation choices documented in Chapter 4: streaming synthesised audio to
the client as it is produced rather than on completion (§4.4.1), so that
time-to-first-audio rather than time-to-complete-utterance is what the candidate
perceives; and the deliberate acceptance of a long, clearly signposted wait for
written-examination generation (§4.6), which is a single ten-second-class
operation the client budgets for explicitly rather than a conversational turn.

### 2.3.3 Multi-party dialogue

Most deployed conversational systems are dyadic — one user, one agent — and the
dialogue-systems literature reflects that bias. Multi-party dialogue introduces
problems a dyadic system never faces: addressee identification, floor
management, and speaker attribution in the transcript record.

VoxPrep faces a constrained form of the problem. Addressee identification is
trivial, since every agent utterance is directed at the candidate. Floor
management is not, and is resolved by an explicit server-side schedule (§4.4.3)
rather than emergent negotiation. Speaker attribution matters because the
transcript is the input to grading, and an exchange attributed to the wrong
panelist misrepresents the session in the candidate's history.

A distinct and less-studied problem is *perceptual* distinctness. A panel is
only a panel if the candidate can tell its members apart, which in an
audio-only channel means by voice alone. This is the substance of RQ2 and is
addressed in §4.4.3 by treating voice distinctness as an invariant the server
enforces against a catalogue, rather than a property of the client's request.

## 2.4 Automated Assessment and Feedback Generation

### 2.4.1 Automated essay and short-answer scoring

Automated scoring of extended written responses has a long history, from early
systems scoring surface features to contemporary neural approaches. The
methodological literature is consistent on how such systems must be validated:
agreement with trained human raters, reported as a chance-corrected statistic,
against a stratified sample.

Cohen (1960) introduced κ for exactly this purpose — agreement between two
raters on categorical judgements, corrected for the agreement expected by
chance. For ordinal scales such as the 0–100 dimensions used here, a weighted
variant is appropriate, since a disagreement of five points should not be
penalised as heavily as one of fifty. Landis and Koch's conventional
interpretation bands are reproduced in §5.7.

The relevant lesson for this project is negative and important: capability has
outrun evaluation practice. Systems built on instruction-following models are
routinely deployed on the strength of their output *reading* plausibly, without
measured agreement against expert judgement. §5.7 specifies the instrument this
project uses to avoid that error, and §6.4 states plainly that administering it
remains outstanding.

### 2.4.2 Automatic question generation

Automatic generation of assessment items from source text has been studied
extensively, historically through syntactic transformation and template filling,
and latterly through generative models. Two quality criteria recur and both are
implemented as constraints in §4.6.

**Answerability** — the item must be answerable from the source material alone,
not from outside knowledge the material does not supply. **Distractor quality** —
for multiple-choice items, incorrect options must be plausible to a candidate
who has not mastered the material and unambiguously incorrect to one who has.
Implausible distractors inflate scores; ambiguous ones make the item unmarkable
and, worse, unfair.

### 2.4.3 The construct-validity problem

An assessment is valid to the extent it measures what it claims to. This is
where automated interview assessment is most vulnerable, and the report treats
it as a limitation rather than a solved problem.

A `confidence_score` derived from a transcript is inferred from lexical
hedging, sentence completion, and answer length — not from vocal affect, and
certainly not from the underlying psychological state. It is a proxy, and one
with a foreseeable fairness hazard: features that read as low confidence in a
transcript correlate with non-native English usage and with culturally variable
speech norms, independent of the candidate's actual command of the material.
§6.4 records this as a limitation and §6.5 identifies differential-item analysis
across first-language groups as necessary future work before any summative use.

The system's formative framing is a partial mitigation rather than a defence.
Nothing in VoxPrep produces a certificate, gates an opportunity, or is shown to
a third party; scores exist to direct the candidate's next practice session. A
proxy measure used to say "your answers ran long and hedged — try stating your
conclusion first" is defensible in a way the same measure used to rank
candidates would not be.

## 2.5 Existing Interview-Preparation Systems

Existing offerings can be positioned on two axes: whether the practice
**responds** to what the candidate says, and whether it derives from the
candidate's **own source material**.

**Table 2.1 — Comparison of interview-preparation approaches**

| Approach | Responds to answers | Uses own material | Spoken | Panel | Graded | Availability |
| --- | --- | --- | --- | --- | --- | --- |
| Static question banks | ✗ | ✗ | ✗ | ✗ | ✗ | Unlimited |
| Question banks with model answers | ✗ | ✗ | ✗ | ✗ | ✗ | Unlimited |
| Recorded-response platforms | ✗ | Partial | ✓ | ✗ | Partial | Unlimited |
| Text-based chatbot practice | ✓ | Partial | ✗ | ✗ | Partial | Unlimited |
| Peer / friend role-play | ✓ | ✓ | ✓ | Rarely | ✗ | Scarce |
| Professional interview coaching | ✓ | ✓ | ✓ | Rarely | ✓ | Scarce, costly |
| University mock-viva panels | ✓ | ✓ | ✓ | ✓ | ✓ | Very scarce |
| **VoxPrep** | ✓ | ✓ | ✓ | ✓ | ✓ | Unlimited |

> **Note to the author.** Populate this table with *named* products before
> submission — the current generation of interview-practice applications,
> university careers-service tools, and any systems reported in the academic
> literature. Give each a citation and an access date, and be scrupulous about
> claims: mark a cell "not documented" rather than "✗" where the vendor does
> not state a capability. An examiner familiar with a product you have
> mischaracterised will discount the whole table.

Three patterns are visible across the categories.

**Responsiveness and availability trade against each other**, and the trade is
imposed by whether a human is required in the loop. Every responsive row is
scarce; every unlimited row is inert. The category the table shows to be
unoccupied — responsive, spoken, panelled, graded, *and* unlimited — is the one
this project targets.

**Own-material grounding is rare even among responsive options.** Text chatbot
practice can be prompted with a job description but generally treats it as
context for a generic question set rather than as the source the questions are
derived from.

**Panel practice is essentially confined to the institutional setting.** Mock
vivas convened by a department are the only widely available multi-examiner
rehearsal, they are rationed to doctoral candidates, and a candidate typically
gets one.

## 2.6 Architectural and Engineering Foundations

### 2.6.1 Architectural style

Fielding (2000) introduced REST as an architectural style characterised by
uniform interface, statelessness, and resource identification, and derived its
properties — scalability, visibility, and independent evolvability of client and
server — from those constraints. The system's HTTP surface follows it: versioned
resource paths under `/api/v1`, standard methods, and no server-side session
state between requests.

REST is, however, the wrong style for the live interview, whose interaction is a
long-lived bidirectional stream of audio frames and control events. That
subsystem uses WebSocket instead, and Chapter 3 argues the resulting hybrid
explicitly rather than treating it as an inconsistency: two interaction styles,
one process, one port (ADR-0001).

### 2.6.2 Modular decomposition

Evans (2003) introduced the *bounded context* — an explicit boundary within
which a domain model is internally consistent, and across which translation is
required. Applied at the module scale rather than the service scale, it yields
the fourteen-module decomposition described in §3.7.3, each module owning its
own vocabulary, persistence, and outward mapping.

The decomposition is deliberately *modular monolith* rather than microservice.
Newman's treatment of service decomposition is clear that distribution imposes
costs — network partial failure, distributed transactions, operational
multiplicity — that are only repaid by independent scaling or independent
deployment, neither of which this system requires. Module boundaries are
enforced by convention and review, and the boundaries are drawn where they would
be drawn for services, leaving extraction available if it is ever warranted.

### 2.6.3 Layering within a module

Fowler (2002) catalogues the layering patterns the module anatomy in §3.7.4
instantiates: a service layer holding domain logic, a data-mapper layer
translating between persistent rows and the shapes crossing the boundary
outward, and a thin controller mediating the transport.

The mapper layer carries a specific security function in this system that is
worth noting as a pattern rather than a detail. A student sitting an examination
must not receive the marking scheme, and the mechanism that guarantees this is
that the mapper used for a paper being sat *has no field* for the correct option
or the explanation. This is structurally stronger than remembering to delete
those fields, because the failure mode of forgetting is disclosure, whereas the
failure mode of a missing field is a visible absence.

### 2.6.4 Quality attributes and their specification

ISO/IEC 25010:2011 defines a product-quality model of eight characteristics —
functional suitability, performance efficiency, compatibility, usability,
reliability, security, maintainability, and portability — with sub-characteristics
beneath each. The non-functional requirements in §3.5 are organised against this
model to ensure coverage is systematic rather than opportunistic, and each is
given a measurable acceptance criterion, since an unmeasurable quality
requirement cannot be verified and therefore is not a requirement.

Nygard (2007) supplies the stability patterns that appear in the implementation:
timeouts on every external call, backstops behind every operation whose
completion depends on an external party, and graceful degradation in preference
to failure. The 15-second closing backstop in §4.4.4 and the idle timeout on the
voice session are instances.

### 2.6.5 Testing strategy

Beck (2002) established test-driven development and, with it, the discipline that
a test articulates a behavioural claim before the code satisfies it. The test
pyramid heuristic — many fast unit tests, fewer integration tests, fewest
end-to-end tests — governs the distribution reported in §5.2.

Two of this system's components are deliberately shaped to be testable in
isolation, which is a design consequence of the testing strategy rather than an
afterthought. The scoring engine is pure — no database, no HTTP framework, no
model client — so its rules can be exercised exhaustively against constructed
inputs (§5.3.4). Panel seating is likewise a pure function from a requested
roster to a seated panel, so the distinctness invariant can be tested against
adversarial inputs, including the hostile ones a real client would never send
(§5.3.3).

### 2.6.6 Documentation practice

Two conventions from practice are adopted for the system's own documentation and
are worth recording as method.

**Architecture Decision Records** (Nygard) capture a decision, the context that
forced it, the options considered, and the consequences accepted — at the time
of the decision, in a numbered immutable record. Seven are recorded for this
system and are reproduced in Appendix C. Their value in a project of this kind is
that a design position argued at the time is evidence, whereas one reconstructed
during write-up is rationalisation.

**The Diátaxis framework** (Procida) separates documentation into four modes by
the user's situation — tutorials for learning, how-to guides for a goal,
reference for looking up, explanation for understanding — on the grounds that
mixing them serves no reader well. The system's documentation set is organised
accordingly, and this report is, in Diátaxis terms, an extended explanation
document with reference appendices.

**The C4 model** (Brown) supplies the architectural notation used throughout
Chapter 3: nested views at four levels of abstraction — context, container,
component, code — each answering a different reader's question. It is preferred
here to a comprehensive UML treatment because a reader needs one view at a time
and each C4 level is legible on its own.

## 2.7 Summary and Research Gap

The literature establishes four things this project depends on. Deliberate
practice with immediate, specific, task-level feedback is what improves
performance (Ericsson et al., 1993; Hattie & Timperley, 2007). Retrieval
practice durably improves retention and is itself an intervention (Roediger &
Karpicke, 2006). Individualised tuition is the most effective known instructional
arrangement and does not scale by human means, while automated tutors approach it
more closely than was once expected (Bloom, 1984; VanLehn, 2011). And the
technical preconditions for automating responsive spoken examination —
robust recognition, instruction-driven composition, and distinguishable
synthesis — are now available as commodity services (Radford et al., 2022;
Vaswani et al., 2017; Brown et al., 2020).

What the literature does not supply, and what §2.5 shows the market does not
either, is a system that combines them: **responsive spoken practice, conducted
by a multi-member panel, derived from the candidate's own source material,
graded per dimension, and continuously available**. Each element exists
somewhere; the combination does not.

Four specific gaps follow, and the project addresses each.

1. **Per-turn composition against a live transcript** is what makes unscripted
   follow-up possible, and is absent from every unlimited-availability option
   surveyed. Addressed in §4.4.2 and evaluated against RQ1.
2. **Perceptual distinctness of a synthetic panel** is not treated in the
   multi-party dialogue literature as an invariant a system must enforce.
   Addressed in §4.4.3 and evaluated against RQ2.
3. **Principled aggregation of partially reported assessment dimensions** —
   distinguishing "scored badly" from "not applicable" — is not addressed by
   the automated-scoring literature, which assumes a complete rubric applied to
   every response. Addressed in §4.5.3 and evaluated against RQ3.
4. **Data minimisation for sensitive source material** is a requirement peculiar
   to systems that ingest curricula vitae and visa material, and is largely
   absent from the design discussion of comparable systems. Addressed in §4.8.4
   and evaluated against RQ5.

The gap this project occupies is therefore not the availability of any single
capability, but the domain engineering required to combine them into a system
that behaves correctly, assesses defensibly, and holds sensitive material
responsibly. That engineering is the subject of the chapters that follow.

---

**Previous:** [Chapter One](01-introduction.md) · **Next:** [Chapter Three — Methodology, System Analysis and Design](03-methodology.md)
