# Front Matter

> **Note to the author.** Every field wrapped in `⟨angle brackets⟩` is
> institution-specific and must be completed before submission. Check the exact
> wording of the declaration and certification pages against your department's
> project handbook — universities differ, and these two pages are the ones
> examiners check first.

---

<div align="center">

# VOXPREP

## AN AI-DRIVEN CONVERSATIONAL PLATFORM FOR SPOKEN INTERVIEW REHEARSAL AND AUTOMATED WRITTEN EXAMINATION FROM USER-SUPPLIED MATERIAL

<br/>

**BY**

**⟨FULL NAME⟩**

**⟨INDEX / MATRICULATION NUMBER⟩**

<br/>

A Project Report Submitted to the ⟨Department of Computer Science⟩,
⟨Faculty / School⟩, ⟨University⟩, in Partial Fulfilment of the Requirements
for the Award of the Degree of

**BACHELOR OF SCIENCE (BSc.) IN COMPUTER SCIENCE**

<br/>

**SUPERVISOR: ⟨Title and Full Name⟩**

<br/>

**⟨MONTH⟩ ⟨YEAR⟩**

</div>

---

## Declaration

I hereby declare that this project report is the result of my own original work
carried out under supervision, and that to the best of my knowledge it contains
no material previously published or written by another person, nor material
which has been accepted for the award of any other degree of this or any other
university, except where due acknowledgement has been made in the text.

The software system described herein — its source code, database schema,
architectural documentation, and test suite — was designed and implemented by
me. Third-party libraries, managed services, and pre-trained models used in the
work are identified in Chapter 4 and listed in Appendix A.

<br/>

| | |
| --- | --- |
| **Candidate:** ⟨Full Name⟩ | Signature: ......................... |
| **Index Number:** ⟨Number⟩ | Date: ......................... |

---

## Certification

I hereby certify that this project report was prepared under my supervision in
accordance with the guidelines on supervision of project work laid down by
⟨University⟩.

<br/>

| | |
| --- | --- |
| **Supervisor:** ⟨Title and Full Name⟩ | Signature: ......................... |
| | Date: ......................... |
| **Head of Department:** ⟨Title and Full Name⟩ | Signature: ......................... |
| | Date: ......................... |

---

## Dedication

⟨To be completed by the author. Conventionally one or two sentences, centred,
on a page of its own.⟩

---

## Acknowledgements

⟨To be completed by the author. Convention is to thank, in order: the
supervisor, academic staff who gave technical guidance, participants who gave
their time to the evaluation, and finally family and friends.⟩

The evaluation described in Chapter 5 depends on volunteers who agreed to sit
mock interviews and written papers and to be observed doing so. That
contribution should be acknowledged explicitly, without naming individuals, in
line with the consent terms in Appendix E.

---

## Abstract

Preparation for a high-stakes oral examination — a job interview, a doctoral
viva, a consular visa interview — is limited by the availability of a competent
interlocutor. The two categories of tool available to candidates address only
part of the problem. Static question banks present a fixed list and cannot
react to what the candidate says, so they rehearse recall rather than
performance. Peer or coached role-play does react, but requires another
person's time and expertise and is therefore neither on-demand nor
consistently graded.

This project designs, implements, and evaluates **VoxPrep**, a mobile platform
that converts material a candidate already possesses — a job description, a
thesis abstract, a visa application, a set of course notes — into two forms of
graded practice. The first is a **live spoken interview** conducted over a
full-duplex WebSocket by a panel of up to four synthetic interviewers with
distinct voices, in which each question is composed at the moment it is asked
against the transcript accumulated so far, making unscripted follow-up
questions possible. The second is a **written multiple-choice examination** of
thirty questions generated from the same material and marked arithmetically
against a stored marking scheme.

The system is realised as two deployables: an Express 5 REST and WebSocket API
of approximately 16,000 lines of JavaScript organised into fourteen bounded
modules, backed by PostgreSQL through Supabase with row-level security on every
user-owned table; and an Expo / React Native client of approximately 13,200
lines of TypeScript targeting iOS, Android, and web. Large-language-model
inference, speech recognition, and speech synthesis are consumed as external
services, leaving the system to own the domain: what a practice session is, how
a panel behaves, what makes a question markable, and what a candidate is told
afterwards.

Four design positions distinguish the implementation and are argued in the
report. Questions are generated **per turn rather than up front**, which is what
makes a follow-up possible and confines inference cost to questions actually
asked. Panel voice distinctness is **enforced by the server against a catalogue
rather than trusted from the client**, because a panel whose members share a
voice is a panel of one wearing several names. Unreported grading metrics are
recorded as **null rather than zero** and excluded from averages, so a
behavioural answer that was never technical is not penalised on technical
accuracy. And extracted curriculum-vitae text — the most sensitive material the
system touches — is **held in memory for the duration of a request and never
persisted**.

Functional correctness was verified by an automated suite of 466 test cases
across 31 suites exercising the session lifecycle, the per-turn loop, the voice
gateway handshake and closing sequence, panel seating, arithmetic marking, the
scoring engine, authentication and token refresh, and document ingestion across
twelve file formats. Chapter 5 additionally specifies the empirical protocol —
latency measurement against Nielsen's response-time thresholds, System Usability
Scale administration, and agreement between machine and human graders measured
by Cohen's κ — by which the non-functional and pedagogical claims are to be
tested.

**Keywords:** conversational agents, automated assessment, speech interfaces,
large language models, interview preparation, mobile computing, WebSocket,
row-level security.

---

## Table of Contents

| | Page |
| --- | --- |
| Declaration | i |
| Certification | ii |
| Dedication | iii |
| Acknowledgements | iv |
| Abstract | v |
| Table of Contents | vi |
| List of Figures | ix |
| List of Tables | x |
| List of Abbreviations | xi |
| **Chapter One — Introduction** | 1 |
| 1.1 Background to the Study | 1 |
| 1.2 Statement of the Problem | 3 |
| 1.3 Aim and Objectives | 4 |
| 1.4 Research Questions | 5 |
| 1.5 Scope of the Study | 5 |
| 1.6 Delimitations and Assumptions | 6 |
| 1.7 Significance of the Study | 7 |
| 1.8 Definition of Operational Terms | 8 |
| 1.9 Organisation of the Report | 9 |
| **Chapter Two — Review of Related Literature** | 10 |
| 2.1 Introduction | 10 |
| 2.2 Theoretical Framework | 10 |
| 2.3 Conversational Agents and Spoken Dialogue Systems | 13 |
| 2.4 Automated Assessment and Feedback Generation | 15 |
| 2.5 Existing Interview-Preparation Systems | 17 |
| 2.6 Architectural and Engineering Foundations | 19 |
| 2.7 Summary and Research Gap | 21 |
| **Chapter Three — Methodology, System Analysis and Design** | 23 |
| 3.1 Introduction | 23 |
| 3.2 Software Development Methodology | 23 |
| 3.3 Requirements Elicitation | 25 |
| 3.4 Functional Requirements | 26 |
| 3.5 Non-Functional Requirements | 29 |
| 3.6 Use-Case Analysis | 31 |
| 3.7 System Architecture | 34 |
| 3.8 Database Design | 39 |
| 3.9 Interface Design | 44 |
| 3.10 Protocol Design | 46 |
| 3.11 Security Design | 48 |
| **Chapter Four — Implementation** | 50 |
| 4.1 Introduction | 50 |
| 4.2 Development Environment and Technology Stack | 50 |
| 4.3 Backend Implementation | 53 |
| 4.4 The Live Voice Subsystem | 58 |
| 4.5 The Generation and Grading Subsystem | 63 |
| 4.6 The Written Examination Subsystem | 66 |
| 4.7 Client Implementation | 68 |
| 4.8 Cross-Cutting Implementation Concerns | 71 |
| 4.9 Implementation Challenges and Resolutions | 74 |
| **Chapter Five — Testing, Results and Evaluation** | 78 |
| 5.1 Introduction | 78 |
| 5.2 Testing Strategy | 78 |
| 5.3 Unit and Integration Testing | 80 |
| 5.4 Functional Verification Against Requirements | 84 |
| 5.5 Non-Functional Evaluation Protocol | 86 |
| 5.6 Usability Evaluation Protocol | 89 |
| 5.7 Assessment-Validity Evaluation Protocol | 91 |
| 5.8 Security Review | 93 |
| 5.9 Discussion of Findings | 95 |
| **Chapter Six — Summary, Conclusion and Recommendations** | 98 |
| 6.1 Summary of the Work | 98 |
| 6.2 Contributions | 99 |
| 6.3 Conclusion | 100 |
| 6.4 Limitations | 101 |
| 6.5 Recommendations for Future Work | 102 |
| **References** | 105 |
| **Appendices** | 110 |

> Page numbers are indicative. Regenerate them after typesetting; do not submit
> a table of contents whose numbers were not produced from the final document.

---

## List of Figures

| Figure | Title | Page |
| --- | --- | --- |
| 3.1 | Iterative-incremental development cycle adopted for the project | 24 |
| 3.2 | Use-case diagram for the VoxPrep system | 32 |
| 3.3 | System context diagram (C4 Level 1) | 35 |
| 3.4 | Container diagram (C4 Level 2) | 36 |
| 3.5 | Backend component diagram (C4 Level 3) | 37 |
| 3.6 | Canonical module anatomy | 38 |
| 3.7 | Entity-relationship diagram of the persistent schema | 40 |
| 3.8 | Client navigation and screen map | 45 |
| 3.9 | Voice-session protocol state machine | 47 |
| 4.1 | HTTP request lifecycle through the middleware stack | 55 |
| 4.2 | End-to-end sequence of a live spoken interview | 59 |
| 4.3 | Floor-rotation schedule for a four-member panel | 61 |
| 4.4 | Closing sequence and its timeout backstop | 62 |
| 4.5 | Grading pipeline from response row to session aggregate | 64 |
| 4.6 | Written-examination lifecycle | 67 |
| 4.7 | Transparent access-token refresh with request queueing | 72 |
| 5.1 | Test pyramid as realised in the project | 79 |
| 5.2 | Distribution of test cases across subsystems | 82 |

---

## List of Tables

| Table | Title | Page |
| --- | --- | --- |
| 1.1 | Operational definitions of domain terms | 8 |
| 2.1 | Comparison of existing interview-preparation systems | 18 |
| 3.1 | Functional requirements | 26 |
| 3.2 | Non-functional requirements and their acceptance criteria | 29 |
| 3.3 | Actors and their goals | 31 |
| 3.4 | Principal use cases | 33 |
| 3.5 | Persistent tables and their responsibilities | 41 |
| 3.6 | Row-level security policy coverage | 43 |
| 3.7 | WebSocket frame types and close codes | 47 |
| 4.1 | Backend technology stack and rationale | 51 |
| 4.2 | Client technology stack and rationale | 52 |
| 4.3 | Backend modules and owned responsibilities | 54 |
| 4.4 | Practice modes and their server-side parameters | 56 |
| 4.5 | Accepted document formats and extractors | 73 |
| 4.6 | Implementation challenges and their resolutions | 75 |
| 5.1 | Test suites and the behaviour each verifies | 81 |
| 5.2 | Traceability of functional requirements to verifying tests | 85 |
| 5.3 | Latency measurement instrument | 87 |
| 5.4 | System Usability Scale instrument | 90 |
| 5.5 | Interpretation of Cohen's κ | 92 |
| 5.6 | Security review against OWASP API Security Top 10 | 94 |

---

## List of Abbreviations

| Abbreviation | Expansion |
| --- | --- |
| ADR | Architecture Decision Record |
| API | Application Programming Interface |
| ASR | Automatic Speech Recognition |
| CORS | Cross-Origin Resource Sharing |
| CRUD | Create, Read, Update, Delete |
| CV | Curriculum Vitae |
| DDD | Domain-Driven Design |
| ERD | Entity-Relationship Diagram |
| GDPR | General Data Protection Regulation |
| HTTP(S) | Hypertext Transfer Protocol (Secure) |
| ITS | Intelligent Tutoring System |
| JSON | JavaScript Object Notation |
| JWT | JSON Web Token |
| LLM | Large Language Model |
| LTS | Long-Term Support |
| MCQ | Multiple-Choice Question |
| ORM | Object-Relational Mapper |
| OTP | One-Time Password |
| OWASP | Open Worldwide Application Security Project |
| PCM | Pulse-Code Modulation |
| REST | Representational State Transfer |
| RLS | Row-Level Security |
| SDK | Software Development Kit |
| SQL | Structured Query Language |
| SUS | System Usability Scale |
| TLS | Transport Layer Security |
| TTS | Text-to-Speech |
| UI / UX | User Interface / User Experience |
| WS / WSS | WebSocket / WebSocket Secure |

---

**Next:** [Chapter One — Introduction](01-introduction.md)
