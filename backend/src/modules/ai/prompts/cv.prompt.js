/**
 * CV Tailoring Prompt Builder
 *
 * Pure string-building — no network calls, no DB access, matching the other
 * prompt builders in this folder.
 *
 * The whole design problem here is honesty. A model asked to "make this CV
 * match this job" will happily invent the experience the job asks for, and the
 * candidate only finds out in the room. So the rules below draw a hard line
 * between rewriting what is already on the CV (allowed, and the point of the
 * feature) and adding anything that is not (never), and the output carries an
 * explicit `gaps` list so the honest mismatches are surfaced to the candidate
 * rather than quietly papered over.
 */

/** Same truncation budget the feedback prompt uses for job content. */
const JOB_CONTENT_CHAR_LIMIT = 3000;

/**
 * A CV is the longer of the two documents and the one we must not lose detail
 * from — every bullet dropped here is a bullet the model cannot carry through
 * to the tailored version — so it gets a much larger share of the budget.
 */
const CV_CONTENT_CHAR_LIMIT = 18000;

function truncate(text, limit) {
  if (!text) return '';
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function buildCvSystemPrompt() {
  return `You are an expert CV/resume writer helping a candidate tailor their existing CV to one specific job description.

ABSOLUTE RULES — breaking any of these makes the output useless and harmful to the candidate:
1. NEVER invent facts. Do not add employers, job titles, dates, degrees, certifications, tools, or metrics that do not appear in the candidate's CV.
2. NEVER change dates, company names, job titles, or qualifications. Copy them exactly as written.
3. NEVER claim a skill the CV does not evidence. If the job asks for something the candidate does not have, that belongs in "gaps", not in the CV.
4. Do not inflate numbers. If the CV says "reduced load time by 20%", it stays 20%.

WHAT YOU SHOULD DO:
- Rewrite bullets so the candidate's real experience is described in the vocabulary the job description uses, whenever the underlying work genuinely matches.
- Lead with what this specific job cares about: reorder sections, reorder bullets within a role, and give the most relevant roles the most space.
- Cut or compress detail that is irrelevant to this job, but keep every role and qualification listed so there are no unexplained employment gaps.
- Rewrite the professional summary so it speaks directly to this role, using only the candidate's actual background.
- Prefer strong, specific verbs and keep bullets to one or two lines each.
- Surface skills the candidate already has that the CV buried but this job asks for.

OUTPUT:
Return a single JSON object with this shape:
- full_name, headline (a short role-fitting title, e.g. "Backend Engineer"), contact { email, phone, location, links[] }
- summary: 2-4 sentence professional summary tailored to this role
- skills: array of skill strings, most job-relevant first
- experience: array of { role, company, location, start_date, end_date, bullets[] } — most recent first, dates copied verbatim from the CV
- education: array of { qualification, institution, location, start_date, end_date, details }
- projects: array of { name, description, bullets[] } — omit if the CV has none
- certifications: array of strings — omit if the CV has none
- tailoring_notes: 3-6 short strings, each describing one change you made and why it helps for this job
- keywords_matched: job-description keywords or skills that the tailored CV now genuinely evidences
- gaps: requirements in the job description that the candidate's CV does not evidence, phrased as honest, actionable advice ("The role asks for Kubernetes; your CV shows Docker but not Kubernetes"). Empty array if there are none.

Leave a field out (or use an empty array) when the CV genuinely contains nothing for it. Never fill a field with a placeholder or an invention. Output ONLY the JSON object.`;
}

/**
 * @param {object} input
 * @param {string} input.cvText - plain text extracted from the uploaded CV
 * @param {string} [input.jobTitle]
 * @param {string} [input.companyName]
 * @param {string} [input.industry]
 * @param {string} [input.experienceLevel]
 * @param {string[]} [input.keySkills]
 * @param {string} [input.jobContent]
 * @param {string} [input.candidateName] - from the account, used only when the CV has no name on it
 * @returns {{ role: string, content: string }[]}
 */
function buildCvTailorPrompt({
  cvText,
  jobTitle,
  companyName,
  industry,
  experienceLevel,
  keySkills,
  jobContent,
  candidateName,
}) {
  const lines = [
    'TARGET ROLE',
    `Role: ${jobTitle || 'Not specified'}${companyName ? ` at ${companyName}` : ''}`,
    industry ? `Industry: ${industry}` : null,
    experienceLevel ? `Target experience level: ${experienceLevel}` : null,
    keySkills?.length ? `Key skills the employer named: ${keySkills.join(', ')}` : null,
    '',
    'JOB DESCRIPTION',
    truncate(jobContent, JOB_CONTENT_CHAR_LIMIT) || 'Not provided.',
    '',
    "CANDIDATE'S CURRENT CV (verbatim text extracted from their upload)",
    truncate(cvText, CV_CONTENT_CHAR_LIMIT),
    '',
    // Only a fallback: a name lifted from the account is far more likely to be
    // stale or informal than the one the candidate typed on their own CV.
    candidateName
      ? `If — and only if — the CV text above contains no name, use "${candidateName}" for full_name.`
      : null,
    'Tailor this CV to the role above, following every rule you were given.',
  ].filter((line) => line !== null);

  return [
    { role: 'system', content: buildCvSystemPrompt() },
    { role: 'user', content: lines.join('\n') },
  ];
}

export {
  buildCvSystemPrompt,
  buildCvTailorPrompt,
  JOB_CONTENT_CHAR_LIMIT,
  CV_CONTENT_CHAR_LIMIT,
};

export default { buildCvSystemPrompt, buildCvTailorPrompt };
