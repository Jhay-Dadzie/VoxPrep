# VoxPrep — Project Report

A final-year undergraduate project report, structured to standard thesis
convention: front matter, six chapters, references, appendices.

## Built documents

| File | Use |
| --- | --- |
| [`VoxPrep-Thesis.docx`](VoxPrep-Thesis.docx) | **The one to work in.** A4, Times New Roman 12 pt, 1.5 spacing, 1.5 in binding margin, roman front matter and arabic body, live table-of-contents field, all 18 figures embedded. Apply your department's formatting here. |
| [`VoxPrep-Thesis.pdf`](VoxPrep-Thesis.pdf) | For reading, printing, and circulating to your supervisor. 95 pages. |

Open the DOCX, right-click the Table of Contents field and choose **Update
Field** — Word generates the entries and page numbers from the headings.

Both files are build products of the Markdown in this directory. Edit the
Markdown and rebuild with the toolchain in [`build/`](build/README.md), or —
once the content is settled — stop rebuilding and finish in Word.

## Contents

| # | Document | Covers |
| --- | --- | --- |
| — | [Front Matter](00-front-matter.md) | Title page, declaration, certification, abstract, contents, lists of figures/tables/abbreviations |
| 1 | [Introduction](01-introduction.md) | Background, problem statement, aim and objectives, research questions, scope, delimitations, significance |
| 2 | [Review of Related Literature](02-literature-review.md) | Theoretical framework, dialogue systems, automated assessment, existing systems, engineering foundations, research gap |
| 3 | [Methodology, System Analysis and Design](03-methodology.md) | Development methodology, requirements, use cases, architecture, database, interface, protocol, security design |
| 4 | [Implementation](04-implementation.md) | Technology stack, backend, voice subsystem, grading, examinations, client, cross-cutting concerns, challenges |
| 5 | [Testing, Results and Evaluation](05-testing-and-evaluation.md) | Testing strategy, measured results, traceability, evaluation protocols, security review, discussion |
| 6 | [Summary, Conclusion and Recommendations](06-conclusion.md) | Summary, contributions, conclusion, limitations, future work |
| — | [References](references.md) | Cited works, grouped for drafting |
| — | [Appendices](appendices.md) | Technology inventory, API, ADRs, evaluation instruments, schema, source, deployment |

## Before you submit

Six things need your attention. They are listed in the order they will cost you
marks if left undone.

1. **Complete every `⟨angle-bracket⟩` field** in the front matter — name, index
   number, department, university, supervisor, date. Check the declaration and
   certification wording against your department's handbook; these two pages
   differ between institutions and are the first thing an examiner looks at.
2. **Read every source in [`references.md`](references.md)** and verify its
   details. The list is genuine and each entry supports a specific claim, but
   citing what you have not read is the fastest way to lose an examiner's
   confidence. Then convert the whole list to your mandated citation style and
   merge the thematic groups into one alphabetical sequence.
3. **Name real products in Table 2.1** (§2.5). The comparison currently
   describes categories; naming systems with citations and access dates makes it
   evidence rather than assertion.
4. **Add primary elicitation if your department expects it** (§3.3, Appendix D).
   A short questionnaire with 10–15 students and 2–3 careers advisers materially
   strengthens Chapter 3.
5. **Decide what to do about the unadministered evaluations.** Chapter 5
   specifies four protocols — latency, usability, assessment validity, security
   review — and states clearly that they have not been run. §5.7 (assessment
   validity) is the one an examiner is most likely to press on. Either
   administer them and replace the protocol sections with results, or defend the
   scoping decision as §5.9.2 and §6.4 already do. Do not present a specified
   protocol as though it had been administered.
6. **Regenerate the page numbers** in the table of contents and the lists of
   figures and tables after typesetting. Never submit numbers that were not
   produced from the final document.

## What is already grounded in the codebase

Written from the delivered system rather than from intention, and re-checkable
against it:

- Module decomposition, file counts, and line counts (§4.1, Appendix G)
- The database schema, its triggers, and its access-control policies (§3.8)
- Practice modes and their server-side parameters (Table 4.4)
- Panel seating, voice-distinctness resolution, and floor rotation (§4.4.3)
- The scoring engine's contracts, function by function (§4.5.3)
- Transcript pairing and the preamble case (§4.4.5)
- The closing sequence and its 15-second backstop (§4.4.4)
- **Chapter 5's test results are measured, not estimated.** Reproduce with
  `cd backend && npx jest --runInBand`.

## Two findings you should act on

Writing Chapter 5 against the running system rather than against intention
surfaced two real defects. Both are reported in the text rather than smoothed
over, because a report that hides what it found is worth less than one that
does not.

**One test fails** (§5.3.2). `auth.test.js` asserts `res.body.url` where the
endpoint returns `{ success, data: { url } }` — a stale assertion left behind
when the OAuth flow was reworked. The defect is in the test, not the system. It
was left in place so the figure in Chapter 5 is the figure that was measured;
fix it by changing the assertion to `res.body.data.url`.

**The sign-in rate limit is too permissive for its stated purpose** (§5.8). One
hundred attempts per address per fifteen minutes bounds resource consumption but
does not meaningfully impede credential stuffing against a known address. The
password-reset limiter (5 per hour) is well set; sign-in and sign-up are not.
This is the one place where the report finds a stated security requirement
unmet, and §6.5.1 recommends splitting the per-address resource limit from a
much lower per-account guessing limit.

## Relationship to the rest of the documentation

This report explains and justifies. The operational documentation in
[`docs/`](../) describes and instructs, organised by
[Diátaxis](https://diataxis.fr/): [`getting-started.md`](../getting-started.md)
teaches, [`architecture.md`](../architecture.md) explains,
[`api/`](../api/) and [`data-model.md`](../data-model.md) describe,
[`testing.md`](../testing.md) and [`deployment.md`](../deployment.md) instruct.
The seven [ADRs](../adr/) are the primary record of the design positions this
report argues, and Appendix C maps each to the section that argues it.
