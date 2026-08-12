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

export type ModeId = 'job_interview' | 'oral_exam' | 'viva_defense'

export type ModeSource = {
  label: string
  placeholder: string
  minLength: number
  optional?: boolean
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

export type Mode = {
  id: ModeId
  label: string
  tagline: string
  /** Ionicons name, used on the picker card and as the mode badge glyph. */
  icon: string
  source: ModeSource
  /** Only job_interview takes a second document (the CV). */
  secondarySource: ModeSource | null
  copy: ModeCopy
  sampleSessions: SampleSession[]
  sampleQuestions: SampleQuestion[]
}

export const MODES: Record<ModeId, Mode> = {
  job_interview: {
    id: 'job_interview',
    label: 'Job Interview',
    tagline: 'Practice for a role you are applying to',
    icon: 'briefcase-outline',
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

  oral_exam: {
    id: 'oral_exam',
    label: 'Oral Exam',
    tagline: 'Practice explaining course material out loud',
    icon: 'school-outline',
    source: {
      label: 'Syllabus or Notes',
      placeholder:
        'Paste your syllabus, lecture notes, or the textbook chapter you are being examined on...',
      minLength: 120,
    },
    secondarySource: null,
    copy: {
      welcomeTitle: 'Welcome to VoxPrep!',
      welcomeSubtitle:
        'Ready to ace your next exam? Practice explaining your material out loud and find the gaps before your examiner does.',
      firstSessionCta: 'Start Your First Session',
      returningPrompt: 'Ready for your next exam?',
      practiceCta: 'Start Practice Session',
      emptyHistory: 'No exam practice yet',
      upcomingLabel: 'Next Exam',
      recentSessionsLabel: 'Recent Sessions',
      sessionsCompletedLabel: 'Sessions Completed',
      setupTitle: 'What are you being examined on?',
      setupSubtitle: 'Your questions are generated strictly from this material.',
      setupInfoNote: 'AI will analyze key concepts, definitions, and how they connect.',
      setupPromoTitle: 'Ready to ace your next exam?',
      setupPromoBody: 'Explain your material out loud and hear where it falls apart.',
      questionTag: 'CONCEPT QUESTION',
      listeningLabel: 'AI Examiner Listening',
      replayLabel: 'Replay Question',
      submitLabel: 'Stop & Submit',
      resultsTitle: 'Exam Feedback',
      resultsHeroTitle: 'Exam Practice Complete!',
      resultsHeroSubtitle: "You've successfully finished your practice session with our AI examiner.",
      structureCheckLabel: 'Concept Coverage',
      retakeCta: 'Retake Practice',
      sessionNoun: 'exam practice',
      sessionNounPlural: 'exam sessions',
      proTip:
        'Paste the exact material you are being examined on. Questions are drawn strictly from it, so the closer it is to your syllabus, the more useful the practice.',
      sampleInsight:
        "Your explanations are getting clearer, but you're still skipping over definitions. Try stating the concept before applying it.",
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
    source: {
      label: 'Project Proposal or Abstract',
      placeholder:
        'Paste your project proposal, abstract, or thesis summary. The AI panel will challenge what you claim in it...',
      minLength: 120,
    },
    secondarySource: null,
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
}

/** Picker order — viva sits second because it is the strongest demo. */
export const MODE_LIST: Mode[] = [MODES.job_interview, MODES.viva_defense, MODES.oral_exam]

export const DEFAULT_MODE: ModeId = 'job_interview'

export function isValidMode(id: string | null | undefined): id is ModeId {
  return !!id && id in MODES
}
