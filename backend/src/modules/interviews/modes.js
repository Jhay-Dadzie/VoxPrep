/**
 * Practice modes — server half.
 *
 * The client ships the display half in frontend/constants/modes.ts (labels,
 * placeholders, per-mode vocabulary). This file holds what should never leave
 * the server: the persona each mode adopts and the instructions that shape
 * question generation.
 *
 * The `id` values must stay in sync with ModeId in frontend/constants/modes.ts.
 *
 * Mode is not persisted on interview_sessions — it is supplied per generation
 * request and only influences the prompt. Storing it would need a migration,
 * and nothing downstream reads it back today.
 */

export const MODE_IDS = ['job_interview', 'oral_exam', 'viva_defense'];

export const DEFAULT_MODE = 'job_interview';

const MODES = {
  job_interview: {
    id: 'job_interview',
    /** Who the AI is playing. */
    persona: 'an experienced hiring manager interviewing a candidate for this role',
    /** What the pasted/uploaded source material is. */
    sourceLabel: 'job description',
    /** Question types this mode should favour, in rough proportion. */
    typeMix: 'roughly 40% behavioral, 30% technical, 20% situational, 10% general',
    /** Mode-specific instructions appended to the shared rules. */
    guidance: [
      'Probe for evidence of the specific responsibilities and skills named in the source.',
      'Behavioral questions must invite a concrete past example, not a hypothetical.',
      'Technical questions must target the actual stack or domain named in the source, never generic trivia.',
      'Include at least one question about a gap, risk, or unusual requirement in the posting.',
    ],
  },

  oral_exam: {
    id: 'oral_exam',
    persona: 'a university examiner conducting an oral examination on this material',
    sourceLabel: 'course material',
    typeMix: 'roughly 50% technical (concept recall and application), 30% situational (applied reasoning), 20% general (synthesis)',
    guidance: [
      'Draw every question strictly from the supplied material. Never test anything it does not cover.',
      'Ask the student to define, derive, or explain — not to recount personal experience.',
      'Include at least one question that connects two separate concepts from the material.',
      'Escalate: start with recall, move to application, end with synthesis.',
    ],
  },

  viva_defense: {
    id: 'viva_defense',
    persona: 'a doctoral examination panel challenging the author of this work',
    sourceLabel: 'project proposal or thesis abstract',
    typeMix: 'roughly 40% technical (methodology and validity), 40% situational (defending choices under challenge), 20% general (contribution and scope)',
    guidance: [
      'Challenge the specific claims made in the source. Quote or paraphrase the claim being challenged.',
      'Press on methodology, sample size, threats to validity, and alternatives the author did not take.',
      'Include at least one question about the limitations the author states, and one about a limitation they omit.',
      'Ask what the original contribution is and where its boundaries lie.',
    ],
  },
};

export const isValidMode = (id) => typeof id === 'string' && id in MODES;

/** Falls back to the default rather than throwing — an unknown mode from an older client should still produce questions. */
export const resolveMode = (id) => MODES[id] || MODES[DEFAULT_MODE];

export default { MODE_IDS, DEFAULT_MODE, isValidMode, resolveMode };
