import { callGemini, parseJsonResponse, tailoredCvSchema } from "../ai.service.js";
import { buildCvTailorPrompt } from "../prompts/cv.prompt.js";
import { GEMINI_CV_MODEL, GEMINI_CV_FALLBACKS } from "../../../config/gemini.js";

/** Trim a value to a non-empty string, or null. */
const text = (value) => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
};

/** Trim a list of strings, dropping blanks and duplicates. */
const list = (value) => {
  if (!Array.isArray(value)) return [];

  const seen = new Set();
  const out = [];

  for (const entry of value) {
    const cleaned = text(entry);
    if (!cleaned) continue;

    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    out.push(cleaned);
  }

  return out;
};

const normalizeExperience = (entries) =>
  (Array.isArray(entries) ? entries : [])
    .map((entry) => ({
      role: text(entry?.role) || "",
      company: text(entry?.company) || "",
      location: text(entry?.location),
      start_date: text(entry?.start_date),
      end_date: text(entry?.end_date),
      bullets: list(entry?.bullets),
    }))
    // A role with neither a title nor an employer cannot be rendered as
    // anything a reader would recognise as a job.
    .filter((entry) => entry.role || entry.company);

const normalizeEducation = (entries) =>
  (Array.isArray(entries) ? entries : [])
    .map((entry) => ({
      qualification: text(entry?.qualification) || "",
      institution: text(entry?.institution) || "",
      location: text(entry?.location),
      start_date: text(entry?.start_date),
      end_date: text(entry?.end_date),
      details: text(entry?.details),
    }))
    .filter((entry) => entry.qualification || entry.institution);

const normalizeProjects = (entries) =>
  (Array.isArray(entries) ? entries : [])
    .map((entry) => ({
      name: text(entry?.name) || "",
      description: text(entry?.description),
      bullets: list(entry?.bullets),
    }))
    .filter((entry) => entry.name);

/**
 * Coerce the model's object into the exact shape the renderer draws.
 *
 * Everything downstream — the PDF the candidate downloads, the preview on the
 * screen — indexes into these fields directly, so a missing key must become an
 * empty array here rather than a crash three layers away.
 */
const normalizeTailoredCv = (parsed) => ({
  full_name: text(parsed?.full_name) || "",
  headline: text(parsed?.headline),
  contact: {
    email: text(parsed?.contact?.email),
    phone: text(parsed?.contact?.phone),
    location: text(parsed?.contact?.location),
    links: list(parsed?.contact?.links),
  },
  summary: text(parsed?.summary) || "",
  skills: list(parsed?.skills),
  experience: normalizeExperience(parsed?.experience),
  education: normalizeEducation(parsed?.education),
  projects: normalizeProjects(parsed?.projects),
  certifications: list(parsed?.certifications),
  tailoring_notes: list(parsed?.tailoring_notes),
  keywords_matched: list(parsed?.keywords_matched),
  gaps: list(parsed?.gaps),
});

/**
 * Rewrite a candidate's CV against one job description.
 *
 * Temperature is deliberately low. This is not a creative task — every liberty
 * the model takes with the candidate's history is a liberty they have to
 * defend in an interview — so the sampling should favour faithful rephrasing
 * over invention, and the prompt's no-fabrication rules over flair.
 *
 * @param {object} input - see buildCvTailorPrompt
 * @returns {Promise<{ document: object, model: string }>}
 */
export const tailorCv = async (input) => {
  const messages = buildCvTailorPrompt(input);

  const result = await callGemini({
    messages,
    temperature: 0.3,
    responseSchema: tailoredCvSchema,
    model: [GEMINI_CV_MODEL, ...GEMINI_CV_FALLBACKS],
  });

  const document = normalizeTailoredCv(parseJsonResponse(result));

  // A CV with no work history and no summary is not a tailored CV — it is a
  // parse that went wrong, and handing it to the candidate as a download would
  // be worse than telling them to try again.
  if (!document.summary && document.experience.length === 0) {
    throw new Error("AI returned no usable CV content");
  }

  return { document, model: GEMINI_CV_MODEL };
};

export default { tailorCv };
