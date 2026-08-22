/**
 * Practice modes — display half.
 *
 * The prompts and grading rubrics live server-side in
 * backend/src/modules/interviews/modes.js and are deliberately not shipped to
 * the client. This file holds what the UI needs: the mode picker, the
 * conditional setup screen, and the per-mode vocabulary every other screen
 * reads through useMode().
 *
 * Mode is to copy what color scheme is to colors. Screens should never hardcode
 * words like "interview" — they read them from here, so that choosing Oral Exam
 * makes the whole app present as exam prep.
 *
 * The `id` values must stay in sync with MODE_IDS on the backend.
 */

import { PANEL_SIZES, type PanelSize } from './interviewers'

export type ModeId = 'job_interview' | 'exam' | 'viva_defense' | 'visa_interview'

/**
 * How a mode is sat.
 *
 * 'voice' modes are spoken conversations with an AI interviewer. 'written' modes
 * are multiple-choice papers: no microphone, no interviewer, no per-answer
 * feedback — a score out of 100 and the reasoning behind each answer.
 *
 * Screens branch on this rather than on the mode id, so the exam flow does not
 * have to be taught about every new mode that joins it.
 */
export type ModeFormat = 'voice' | 'written'

export type ModeSource = {
  label: string
  placeholder: string
  minLength: number
  optional?: boolean
}

/**
 * How many people may sit opposite the user in this mode.
 *
 * Most modes leave it open, but a consular interview is conducted by a single
 * officer behind a window — offering a panel there would be rehearsing an event
 * that does not happen. The constraint lives here rather than in the practice
 * screen so the filter and the session read it from the same place.
 */
export type ModePanel = {
  /** Selectable panel sizes, smallest first. */
  sizes: PanelSize[]
  /** Shown under the panel filter whenever the mode narrows the choice. */
  note?: string
}

/**
 * Every user-visible string that differs between modes. Adding a screen means
 * adding its strings here for all three modes, not branching on mode in the
 * component.
 */
export type ModeCopy = {
  /** Dashboard */
  welcomeTitle: string
  welcomeSubtitle: string
  firstSessionCta: string
  returningPrompt: string
  practiceCta: string
  emptyHistory: string
  upcomingLabel: string
  recentSessionsLabel: string
  sessionsCompletedLabel: string

  /** Setup screen */
  setupTitle: string
  setupSubtitle: string
  /** Note under the input explaining what the AI does with the source material. */
  setupInfoNote: string
  setupPromoTitle: string
  setupPromoBody: string

  /** Session screen */
  questionTag: string
  listeningLabel: string
  replayLabel: string
  submitLabel: string

  /** Results screen */
  resultsTitle: string
  resultsHeroTitle: string
  resultsHeroSubtitle: string
  /** The mode-specific structural check shown alongside clarity and pace. */
  structureCheckLabel: string
  retakeCta: string

  /** Generic noun for a single session, used in sentences. */
  sessionNoun: string
  sessionNounPlural: string

  /** Dashboard pro-tip card. */
  proTip: string
  /** Placeholder AI insight. Replaced by real generated insight once sessions exist. */
  sampleInsight: string
}

/**
 * Placeholder history rows, shown until real sessions exist.
 * Delete these once the dashboard reads from the backend.
 */
export type SampleSession = {
  icon: string
  title: string
  meta: string
  score: number
  tone: 'success' | 'warning' | 'danger'
}

/**
 * Placeholder per-question breakdown on the results screen, shown until a real
 * graded session exists. Delete alongside SampleSession once results read from
 * the backend.
 */
export type SampleQuestion = {
  n: string
  title: string
  meta: string
  score: string
  badge: string
  tone: 'success' | 'warning'
  insight: string
}

/**
 * The shape of a written paper. Present only on 'written' modes.
 *
 * The count is fixed rather than chosen: a student sitting an exam expects to
 * know how long it is, and the server sets the same number, so the two must
 * agree. Treat this as display copy — the paper the server returns is the one
 * that counts, and a short one (thin source material) is rendered as it comes.
 */
export type ModePaper = {
  questionCount: number
  optionCount: number
}

/**
 * Whether this mode lets the user pick who questions them.
 *
 * A written paper has nobody reading it aloud, so the panel-size and voice
 * filters are not narrowed for exams — they are switched off. The note explains
 * why, because a control that greys out with no reason given reads as broken.
 */
export type ModeInterviewerChoice = {
  enabled: boolean
  note?: string
}

export type Mode = {
  id: ModeId
  label: string
  tagline: string
  /** Ionicons name, used on the picker card and as the mode badge glyph. */
  icon: string
  /** Spoken conversation, or written paper — see ModeFormat. */
  format: ModeFormat
  source: ModeSource
  /** Only job_interview takes a second document (the CV). */
  secondarySource: ModeSource | null
  /** Panel sizes this mode allows — see ModePanel. */
  panel: ModePanel
  /** Whether the interviewer filters apply at all — see ModeInterviewerChoice. */
  interviewerChoice: ModeInterviewerChoice
  /**
   * Whether to offer a tailored CV when the session ends.
   *
   * Only where the source material is a job description. A consular officer's
   * questions and a syllabus are not something a CV can be rewritten against,
   * and offering it there sends the user to a screen that cannot help them.
   */
  offersCvTailoring: boolean
  /** Set on written modes only. */
  paper?: ModePaper
  copy: ModeCopy
  /** Strings only the exam screens use. Set on written modes only. */
  examCopy?: ExamCopy
  sampleSessions: SampleSession[]
  sampleQuestions: SampleQuestion[]
}

/** Wording for the exam-only screens: sitting the paper, and reading the marks. */
export type ExamCopy = {
  /** Shown while the paper is being written. It is the slowest wait in the app. */
  generatingNote: string
  /** Sub-heading on the review step, before the paper is submitted. */
  reviewSubtitle: string
  /** The button that marks the paper. */
  submitCta: string
  /** Shown under the score once the paper is marked. */
  resultsSubtitle: string
}

export const MODES: Record<ModeId, Mode> = {
  job_interview: {
    id: 'job_interview',
    label: 'Job Interview',
    tagline: 'Practice for a role you are applying to',
    icon: 'briefcase-outline',
    format: 'voice',
    source: {
      label: 'Job Description',
      placeholder:
        'Paste the full job description here including responsibilities, requirements, and about the company...',
      minLength: 120,
    },
    secondarySource: {
      label: 'Your CV',
      placeholder: 'Optional — paste your CV to get questions that probe gaps against this role.',
      minLength: 0,
      optional: true,
    },
    panel: { sizes: PANEL_SIZES },
    interviewerChoice: { enabled: true },
    // The only mode whose source material is a job description.
    offersCvTailoring: true,
    copy: {
      welcomeTitle: 'Welcome to VoxPrep!',
      welcomeSubtitle:
        'Ready to land your dream job? Start practicing with AI-driven, realistic interview scenarios.',
      firstSessionCta: 'Start Your First Session',
      returningPrompt: 'Ready for your next interview?',
      practiceCta: 'Start Practice Session',
      emptyHistory: 'No interview history yet',
      upcomingLabel: 'Next Interview',
      recentSessionsLabel: 'Recent Sessions',
      sessionsCompletedLabel: 'Sessions Completed',
      setupTitle: 'What are you interviewing for?',
      setupSubtitle: 'Your questions are generated from this description.',
      setupInfoNote: 'AI will analyze tone, keywords, and technical requirements.',
      setupPromoTitle: 'Ready to master your next interview?',
      setupPromoBody: 'Start a mock interview with real-time audio feedback.',
      questionTag: 'BEHAVIORAL QUESTION',
      listeningLabel: 'AI Interviewer Listening',
      replayLabel: 'Replay Question',
      submitLabel: 'Stop & Submit',
      resultsTitle: 'Interview Feedback',
      resultsHeroTitle: 'Interview Session Complete!',
      resultsHeroSubtitle: "You've successfully finished your mock interview with our AI recruiter.",
      structureCheckLabel: 'STAR Structure',
      retakeCta: 'Retake Session',
      sessionNoun: 'interview',
      sessionNounPlural: 'interviews',
      proTip:
        'Practice with a specific job description. Paste it before your session to get tailored questions directly relevant to your target role.',
      sampleInsight:
        "You've shown 15% improvement in technical articulation this week. Keep focusing on STAR method examples.",
    },
    sampleSessions: [
      { icon: 'code-slash', title: 'Software Engineer', meta: '2 days ago • 15 mins', score: 92, tone: 'success' },
      { icon: 'bar-chart', title: 'Product Manager', meta: '5 days ago • 22 mins', score: 74, tone: 'warning' },
      { icon: 'person', title: 'Behavioral Prep', meta: '1 week ago • 10 mins', score: 48, tone: 'danger' },
    ],
    sampleQuestions: [
      {
        n: '01',
        title: '"Tell me about yourself and your background."',
        meta: 'Behavioral Question • 2m 15s',
        score: '9/10',
        badge: 'Exceptional',
        tone: 'success',
        insight:
          'Your narrative arc was very strong. You connected your past experiences to the current role requirements effectively. Consider shortening the early educational part to spend more time on recent wins.',
      },
      {
        n: '02',
        title: '"How do you handle conflict within a team environment?"',
        meta: 'Situational Question • 3m 40s',
        score: '6/10',
        badge: 'Needs Work',
        tone: 'warning',
        insight:
          'While your example was relevant, the resolution felt a bit vague. Try using the STAR method (Situation, Task, Action, Result) more strictly to quantify the positive outcome of your intervention.',
      },
      {
        n: '03',
        title: '"Where do you see yourself in five years?"',
        meta: 'Career Goals • 1m 50s',
        score: '8.5/10',
        badge: 'Strong',
        tone: 'success',
        insight:
          'Great alignment with company values! Your response showed ambition while remaining realistic. Adding a specific skill you hope to master would make this answer a perfect 10.',
      },
    ],
  },

  /**
   * The one written mode: a thirty-question multiple-choice paper.
   *
   * It shares the mode picker and the source material with the spoken modes and
   * nothing else. No microphone, no interviewer, no per-answer AI critique —
   * questions are answered by tapping, and the paper is marked out of 100 the
   * way an exam is, with the reasoning shown afterwards for every question.
   */
  exam: {
    id: 'exam',
    label: 'Exam',
    tagline: 'Sit a 30-question paper on your material',
    icon: 'school-outline',
    format: 'written',
    source: {
      label: 'Syllabus or Notes',
      placeholder:
        'Paste your syllabus, lecture notes, or the textbook chapter you are being examined on...',
      minLength: 120,
    },
    secondarySource: null,
    panel: { sizes: PANEL_SIZES },
    // Nobody reads a written paper aloud, so these filters do not apply at all.
    interviewerChoice: {
      enabled: false,
      note: 'An exam is a written paper you answer by tapping, so there is no interviewer to choose and no voice to hear.',
    },
    offersCvTailoring: false,
    paper: { questionCount: 30, optionCount: 4 },
    copy: {
      welcomeTitle: 'Welcome to VoxPrep!',
      welcomeSubtitle:
        'Ready to ace your next exam? Sit a paper on your own material and find the gaps before your examiner does.',
      firstSessionCta: 'Sit Your First Exam',
      returningPrompt: 'Ready for your next exam?',
      practiceCta: 'Start an Exam',
      emptyHistory: 'No exams sat yet',
      upcomingLabel: 'Next Exam',
      recentSessionsLabel: 'Recent Exams',
      sessionsCompletedLabel: 'Exams Completed',
      setupTitle: 'What are you being examined on?',
      setupSubtitle: 'Your paper is set strictly from this material.',
      setupInfoNote: 'AI will set 30 multiple-choice questions on the concepts, definitions and examples in it.',
      setupPromoTitle: 'Ready to ace your next exam?',
      setupPromoBody: 'Sit a full paper on your own notes and see exactly where you stand.',
      questionTag: 'QUESTION',
      listeningLabel: 'Choose one answer',
      replayLabel: 'Previous Question',
      submitLabel: 'Complete Exam',
      resultsTitle: 'Exam Results',
      resultsHeroTitle: 'Exam Complete!',
      resultsHeroSubtitle: 'Your paper has been marked. Here is how you did.',
      structureCheckLabel: 'Concept Coverage',
      retakeCta: 'Sit a New Paper',
      sessionNoun: 'exam',
      sessionNounPlural: 'exams',
      proTip:
        'Paste the exact material you are being examined on. Every question is set from it, so the closer it is to your syllabus, the more your score means.',
      sampleInsight:
        'You score well on definitions but lose marks where two concepts have to be told apart. Those are worth a second pass.',
    },
    examCopy: {
      generatingNote:
        'Setting your paper — reading your material and writing 30 questions takes up to a minute.',
      reviewSubtitle:
        'Check your answers before you submit. Tap any question to go back to it — nothing is marked until you complete the exam.',
      submitCta: 'Complete Exam',
      resultsSubtitle:
        'Every question is below with the right answer and why it is right. Wrong answers are marked in red.',
    },
    sampleSessions: [
      { icon: 'flask', title: 'Organic Chemistry', meta: '2 days ago • 15 mins', score: 92, tone: 'success' },
      { icon: 'calculator', title: 'Statistics — Ch. 4', meta: '5 days ago • 22 mins', score: 74, tone: 'warning' },
      { icon: 'book', title: 'Pharmacology', meta: '1 week ago • 10 mins', score: 48, tone: 'danger' },
    ],
    sampleQuestions: [
      {
        n: '01',
        title: '"Define enthalpy and explain why it is a state function."',
        meta: 'Definition • 2m 15s',
        score: '9/10',
        badge: 'Exceptional',
        tone: 'success',
        insight:
          'You stated the definition precisely before applying it, which is exactly what an examiner wants to hear. Your reasoning for path independence was clear. Consider adding a worked example to show command of the idea.',
      },
      {
        n: '02',
        title: '"Walk me through why this reaction favours the products."',
        meta: 'Applied Concept • 3m 40s',
        score: '6/10',
        badge: 'Needs Work',
        tone: 'warning',
        insight:
          'You reached the right conclusion but skipped the reasoning between steps. Examiners grade the chain, not the answer. Name the principle you are invoking before you use it.',
      },
      {
        n: '03',
        title: '"How does this concept relate to what we covered last week?"',
        meta: 'Synthesis • 1m 50s',
        score: '8.5/10',
        badge: 'Strong',
        tone: 'success',
        insight:
          'Good cross-topic linking — this is what separates memorisation from understanding. Naming the shared underlying principle explicitly would take this to full marks.',
      },
    ],
  },

  viva_defense: {
    id: 'viva_defense',
    label: 'Viva / Defense',
    tagline: 'Rehearse defending your own project',
    icon: 'document-text-outline',
    format: 'voice',
    source: {
      label: 'Project Proposal or Abstract',
      placeholder:
        'Paste your project proposal, abstract, or thesis summary. The AI panel will challenge what you claim in it...',
      minLength: 120,
    },
    secondarySource: null,
    panel: { sizes: PANEL_SIZES },
    interviewerChoice: { enabled: true },
    offersCvTailoring: false,
    copy: {
      welcomeTitle: 'Welcome to VoxPrep!',
      welcomeSubtitle:
        'Ready to defend your project? Face the questions your panel will actually ask — before they ask them.',
      firstSessionCta: 'Start Your First Rehearsal',
      returningPrompt: 'Ready for your next defense?',
      practiceCta: 'Start Rehearsal',
      emptyHistory: 'No rehearsals yet',
      upcomingLabel: 'Next Defense',
      recentSessionsLabel: 'Recent Rehearsals',
      sessionsCompletedLabel: 'Rehearsals Completed',
      setupTitle: 'What are you defending?',
      setupSubtitle: 'The AI panel will challenge the claims you make in it.',
      setupInfoNote: 'AI will analyze your claims, methodology, and stated limitations.',
      setupPromoTitle: 'Ready to face your panel?',
      setupPromoBody: 'Rehearse the questions your panel will actually ask.',
      questionTag: 'PANEL CHALLENGE',
      listeningLabel: 'AI Panel Listening',
      replayLabel: 'Replay Question',
      submitLabel: 'Stop & Submit',
      resultsTitle: 'Defense Feedback',
      resultsHeroTitle: 'Rehearsal Complete!',
      resultsHeroSubtitle: "You've successfully finished your rehearsal with our AI panel.",
      structureCheckLabel: 'Defense Strength',
      retakeCta: 'Retake Rehearsal',
      sessionNoun: 'rehearsal',
      sessionNounPlural: 'rehearsals',
      proTip:
        'Paste the proposal exactly as your panel will read it. The AI challenges the claims you actually made, including the ones you glossed over.',
      sampleInsight:
        "You defend your methodology well, but tend to get defensive about limitations. Acknowledging them directly reads as stronger command of the work.",
    },
    sampleSessions: [
      { icon: 'shield-checkmark', title: 'Methodology Defense', meta: '2 days ago • 15 mins', score: 92, tone: 'success' },
      { icon: 'git-branch', title: 'Scope & Limitations', meta: '5 days ago • 22 mins', score: 74, tone: 'warning' },
      { icon: 'bulb', title: 'Contribution & Novelty', meta: '1 week ago • 10 mins', score: 48, tone: 'danger' },
    ],
    sampleQuestions: [
      {
        n: '01',
        title: '"Why did you choose this methodology over the alternatives?"',
        meta: 'Methodology • 2m 15s',
        score: '9/10',
        badge: 'Exceptional',
        tone: 'success',
        insight:
          'You justified the choice against named alternatives rather than defending it in isolation — exactly the right move. Briefly conceding what the alternative would have done better would read as even more confident.',
      },
      {
        n: '02',
        title: '"Your sample size seems small. How do you justify your conclusions?"',
        meta: 'Validity Challenge • 3m 40s',
        score: '6/10',
        badge: 'Needs Work',
        tone: 'warning',
        insight:
          'You became defensive rather than engaging the critique. Panels test whether you know your own limits. State the constraint plainly, then scope your claim to what the data actually supports.',
      },
      {
        n: '03',
        title: '"What is the original contribution of this work?"',
        meta: 'Contribution • 1m 50s',
        score: '8.5/10',
        badge: 'Strong',
        tone: 'success',
        insight:
          'Clear and well-bounded — you claimed neither too much nor too little. Naming the specific gap in the existing literature that you close would sharpen this further.',
      },
    ],
  },

  visa_interview: {
    id: 'visa_interview',
    label: 'Visa Interview',
    tagline: 'Rehearse the questions a consular officer will ask',
    icon: 'airplane-outline',
    format: 'voice',
    source: {
      label: 'Application Details',
      placeholder:
        'Paste your visa type and destination, purpose of travel, who is funding it, your school or employer, and your ties to home...',
      minLength: 120,
    },
    secondarySource: null,
    // A consular interview is one officer at one window. Offering a panel here
    // would be rehearsing an event that does not happen.
    panel: {
      sizes: [1],
      note: 'A visa interview is always conducted by a single consular officer, so the panel is fixed at one.',
    },
    interviewerChoice: { enabled: true },
    // A consular officer is not hiring, so there is no CV to tailor.
    offersCvTailoring: false,
    copy: {
      welcomeTitle: 'Welcome to VoxPrep!',
      welcomeSubtitle:
        'Ready for your embassy appointment? Practise the questions a consular officer asks — and how briefly they expect them answered.',
      firstSessionCta: 'Start Your First Session',
      returningPrompt: 'Ready for your next visa interview?',
      practiceCta: 'Start Practice Session',
      emptyHistory: 'No visa practice yet',
      upcomingLabel: 'Next Appointment',
      recentSessionsLabel: 'Recent Sessions',
      sessionsCompletedLabel: 'Sessions Completed',
      setupTitle: 'What visa are you applying for?',
      setupSubtitle: 'Your questions are generated from these details.',
      setupInfoNote: 'AI will analyze your purpose of travel, funding, and ties to home.',
      setupPromoTitle: 'Ready for the window?',
      setupPromoBody: 'Answer a consular officer out loud before you face one.',
      questionTag: 'CONSULAR QUESTION',
      listeningLabel: 'Consular Officer Listening',
      replayLabel: 'Replay Question',
      submitLabel: 'Stop & Submit',
      resultsTitle: 'Visa Interview Feedback',
      resultsHeroTitle: 'Visa Practice Complete!',
      resultsHeroSubtitle:
        "You've successfully finished your mock interview with our AI consular officer.",
      structureCheckLabel: 'Answer Consistency',
      retakeCta: 'Retake Session',
      sessionNoun: 'visa interview',
      sessionNounPlural: 'visa interviews',
      proTip:
        'Officers decide in a couple of minutes. Practise answering in one or two clear sentences — long, rehearsed-sounding answers work against you.',
      sampleInsight:
        'Your answers on funding are clear, but your stated return plans keep shifting. Consistency is what an officer is listening for.',
    },
    sampleSessions: [
      { icon: 'school', title: 'Student Visa (F-1)', meta: '2 days ago • 15 mins', score: 92, tone: 'success' },
      { icon: 'briefcase', title: 'Work Visa', meta: '5 days ago • 22 mins', score: 74, tone: 'warning' },
      { icon: 'people', title: 'Visitor Visa', meta: '1 week ago • 10 mins', score: 48, tone: 'danger' },
    ],
    sampleQuestions: [
      {
        n: '01',
        title: '"Why did you choose this particular school and course?"',
        meta: 'Purpose of Travel • 2m 15s',
        score: '9/10',
        badge: 'Exceptional',
        tone: 'success',
        insight:
          'You named specific reasons tied to your background rather than praising the country, which is exactly the right instinct. Keep it to two sentences — officers read length as rehearsal.',
      },
      {
        n: '02',
        title: '"Who is sponsoring your trip, and what do they do?"',
        meta: 'Funding • 3m 40s',
        score: '6/10',
        badge: 'Needs Work',
        tone: 'warning',
        insight:
          'Your figures did not match what you said earlier about your sponsor\'s income. Officers cross-check answers against each other and against your forms. State one clear, consistent set of numbers.',
      },
      {
        n: '03',
        title: '"What will you do when your studies are finished?"',
        meta: 'Ties to Home • 1m 50s',
        score: '8.5/10',
        badge: 'Strong',
        tone: 'success',
        insight:
          'Good — you gave a concrete plan at home rather than a vague intention to return. Naming the family, property, or job waiting for you would make the tie harder to doubt.',
      },
    ],
  },
}

/** Picker order — viva sits second because it is the strongest demo. */
export const MODE_LIST: Mode[] = [
  MODES.job_interview,
  MODES.viva_defense,
  MODES.exam,
  MODES.visa_interview,
]

export const DEFAULT_MODE: ModeId = 'job_interview'

/**
 * Mode ids this build no longer has, mapped to what replaced them.
 *
 * `oral_exam` was a spoken examiner before the exam became a written paper. It
 * is still in local storage on an installed app, and dropping the user back to
 * the default mode on upgrade would silently change what they are preparing for.
 */
const LEGACY_MODE_IDS: Record<string, ModeId> = { oral_exam: 'exam' }

/** The current id for a stored or wire value, following any rename. */
export function normalizeModeId(id: string | null | undefined): string | null | undefined {
  return id && id in LEGACY_MODE_IDS ? LEGACY_MODE_IDS[id] : id
}

export function isValidMode(id: string | null | undefined): id is ModeId {
  const normalized = normalizeModeId(id)
  return !!normalized && normalized in MODES
}

/** True when this mode is a written paper rather than a spoken session. */
export function isWrittenMode(id: ModeId): boolean {
  return MODES[id].format === 'written'
}

/** The panel sizes the practice screen may offer for a mode. */
export function allowedPanelSizes(id: ModeId): PanelSize[] {
  return MODES[id].panel.sizes
}

/**
 * Bring a panel size back inside what the mode allows.
 *
 * Called whenever the mode changes: someone who had a panel of four selected
 * and then switches to a visa interview must end up on one officer, not on a
 * size the session could not honour.
 */
export function clampPanelSize(id: ModeId, size: PanelSize): PanelSize {
  const sizes = allowedPanelSizes(id)
  return sizes.includes(size) ? size : sizes[0]
}
