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
 *
 * ── Two formats, not one ────────────────────────────────────────────────────
 *
 * Every mode but `exam` is a spoken conversation: a persona is briefed once and
 * then talks (see agent.prompt.js). `exam` is a written multiple-choice paper —
 * thirty questions generated up front, answered by tapping, marked out of 100.
 * It shares the mode picker and the source material, and nothing else: no voice,
 * no panel, no per-answer AI feedback. `format` is what every caller branches on
 * rather than testing the id, so adding a second written mode later costs
 * nothing here.
 */

export const MODE_IDS = ['job_interview', 'exam', 'viva_defense', 'visa_interview'];

/**
 * Mode ids retired from MODE_IDS but still arriving from installed clients.
 *
 * `oral_exam` was a spoken examiner before the exam became a written paper. An
 * older build still has that id in local storage and sends it on every request,
 * and rejecting it would break setup for anyone who has not updated.
 */
const MODE_ALIASES = { oral_exam: 'exam' };

/** Every mode id the API accepts on the wire, including retired ones. */
export const ACCEPTED_MODE_IDS = [...MODE_IDS, ...Object.keys(MODE_ALIASES)];

export const DEFAULT_MODE = 'job_interview';

const MODES = {
  job_interview: {
    id: 'job_interview',
    /** 'voice' modes are spoken conversations; 'written' modes are marked papers. */
    format: 'voice',
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

  /**
   * A written multiple-choice paper, not a conversation.
   *
   * Nothing in here is spoken, so there is no persona to voice and no panel to
   * seat. What it needs instead is the shape of the paper: how many questions,
   * how many options each, and the rules that keep a generated question set
   * markable — one defensible answer, distractors that are wrong for a reason,
   * and an explanation the student can learn from.
   */
  exam: {
    id: 'exam',
    format: 'written',
    persona: 'a university examiner setting a multiple-choice paper on this material',
    sourceLabel: 'course material',
    paper: {
      /** Questions on the paper. Fixed: a student sitting an exam expects a known length. */
      questionCount: 30,
      /** Options per question, labelled A upwards. */
      optionCount: 4,
    },
    /**
     * Unused by the paper, kept for the voice prompt: an installed client whose
     * mode id is still `oral_exam` opens the agent socket expecting a spoken
     * examiner, and a mode with no typeMix would render a broken brief.
     */
    typeMix:
      'roughly 50% technical (concept recall and application), 30% situational (applied reasoning), 20% general (synthesis)',
    guidance: [
      'Draw every question strictly from the supplied material. Never test anything it does not cover.',
      'Exactly one option must be defensibly correct; the other three must be wrong on the material, not merely worse.',
      'Distractors must be plausible — a common misconception, a neighbouring concept, or a right answer to a different question. Never filler.',
      'Vary what is tested: definitions, application, comparison between two concepts, and reading a result or example.',
      'Escalate across the paper: recall first, application in the middle, synthesis last.',
      'Explain why the correct option is correct in one or two sentences, in terms a student who chose wrongly can learn from.',
    ],
  },

  viva_defense: {
    id: 'viva_defense',
    format: 'voice',
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

  visa_interview: {
    id: 'visa_interview',
    format: 'voice',
    persona: 'a consular officer conducting a visa interview at an embassy window',
    sourceLabel: 'visa application details',
    typeMix:
      'roughly 50% general (purpose of travel, plans, background), 30% situational (funding, ties to home, what happens if plans change), 20% technical (specifics of the course, job, or itinerary)',
    guidance: [
      'Keep questions short and direct. A consular officer has a few minutes and asks in plain language.',
      'Cover the four things an officer decides on: purpose of travel, ability to fund it, ties to the home country, and intent to return.',
      'Cross-check answers against each other and against the application. Where two answers do not line up, ask about the discrepancy plainly.',
      'Never state or imply a decision, never say the visa is approved or refused, and never give immigration advice.',
      // A visa interview is one officer at one window, so the panel size sent
      // by the client is ignored for this mode — see buildPanelBrief.
      'You are alone at the window. Never refer to colleagues or to a panel.',
    ],
    /** Fixed panel size, regardless of what the client asks for. */
    panelSize: 1,
  },
};

/** Canonical id for a mode as it arrived, following any alias. */
export const normalizeModeId = (id) =>
  typeof id === 'string' ? MODE_ALIASES[id] || id : id;

export const isValidMode = (id) => normalizeModeId(id) in MODES;

/** Falls back to the default rather than throwing — an unknown mode from an older client should still produce questions. */
export const resolveMode = (id) => MODES[normalizeModeId(id)] || MODES[DEFAULT_MODE];

/**
 * True when this mode is a written paper rather than a spoken session.
 *
 * The voice gateway and the exams module are mutually exclusive on this: a
 * written mode has no agent to connect to, and a spoken one has no paper to
 * mark.
 */
export const isWrittenMode = (id) => resolveMode(id).format === 'written';

/** The paper's shape for a written mode; null for spoken ones. */
export const resolvePaper = (id) => resolveMode(id).paper || null;

/** Largest panel any mode will run with. */
export const MAX_PANEL_SIZE = 4;

/**
 * How many people the candidate is facing.
 *
 * The client sends what the user picked, but the mode has the final say: a
 * consular interview is one officer at one window whatever the filter said, and
 * a stale or hand-rolled client cannot talk the server into a panel of nine.
 */
export const resolvePanelSize = (modeId, requested) => {
  const mode = resolveMode(modeId);
  if (mode.panelSize) return mode.panelSize;

  const size = Math.round(Number(requested));
  if (!Number.isFinite(size) || size < 1) return 1;
  return Math.min(size, MAX_PANEL_SIZE);
};

export default {
  MODE_IDS,
  ACCEPTED_MODE_IDS,
  DEFAULT_MODE,
  MAX_PANEL_SIZE,
  normalizeModeId,
  isValidMode,
  isWrittenMode,
  resolveMode,
  resolvePaper,
  resolvePanelSize,
};
