/**
 * Interviewer selection — who asks the questions.
 *
 * Orthogonal to the practice mode in constants/modes.ts: the mode decides what
 * you are asked, this decides who asks it. A viva rehearsal in front of a
 * four-person panel and a one-on-one job interview are the same pipeline with
 * different voices attached.
 *
 * The voice ids are what the backend maps to TTS voices, so they must stay in
 * sync with the voice table in backend/src/modules/interviews/voices.js. The
 * avatars here are placeholders and are expected to be replaced with generated
 * or licensed portraits before release.
 */

import type { ImageSourcePropType } from 'react-native'

export type Gender = 'male' | 'female'

export type InterviewerId =
  | 'single_male'
  | 'single_female'
  | 'panel_two'
  | 'panel_three'
  | 'panel_three_alt'
  | 'panel_four'

export type Panelist = {
  /** Stable key, and the id the backend resolves to a TTS voice. */
  voiceId: string
  name: string
  gender: Gender
  /** Seat on the panel — shown under the avatar during a session. */
  role: string
  /**
   * A bundled image via require(), or a URL string.
   *
   * Both are allowed so portraits can be replaced one at a time rather than
   * all ten at once. Render with avatarSource() — a bundled asset and a remote
   * URL need different shapes on <Image>.
   */
  avatar: ImageSourcePropType | string
}

/** Normalise either avatar form into something <Image source={...}> accepts. */
export function avatarSource(panelist: Panelist): ImageSourcePropType {
  return typeof panelist.avatar === 'string' ? { uri: panelist.avatar } : panelist.avatar
}

const TITLES = /^(dr|prof|professor|mr|mrs|ms|miss)\.?$/i

/**
 * The name to show under a small avatar.
 *
 * Naively taking the first word would render "Dr." for a titled panelist, so
 * titles are skipped. Hyphenated names stay intact.
 */
export function shortName(panelist: Panelist): string {
  const parts = panelist.name.split(' ').filter(Boolean)
  return parts.find((part) => !TITLES.test(part)) ?? panelist.name
}

export type Interviewer = {
  id: InterviewerId
  label: string
  tagline: string
  /** Ionicons name, used on the picker card and the session badge. */
  icon: string
  /** True when more than one voice asks questions. */
  isPanel: boolean
  /** What the session screen shows while the user is speaking. */
  listeningLabel: string
  /** One entry for a single interviewer, three or four for a panel. */
  members: Panelist[]
}

// Relative rather than the "@/" alias: require() for assets is resolved by
// Metro at bundle time, which does not read the TypeScript path mapping.
const ROSEMARY: Panelist = {
  voiceId: 'f_warm_01',
  name: 'Dr. Rose-Mary',
  gender: 'female',
  role: 'Chair',
  avatar: require('../assets/images/rosemary.png'),
}

const BENJAMIN: Panelist = {
  voiceId: 'm_measured_01',
  name: 'Dr. Benjamin Partey',
  gender: 'male',
  role: 'Interviewer',
  avatar: require('../assets/images/benjamin.png'),
}

const MARCUS: Panelist = {
  voiceId: 'm_direct_02',
  name: 'Marcus Bell',
  gender: 'male',
  role: 'Technical',
  avatar: 'https://i.pravatar.cc/200?img=33',
}

const PRIYA: Panelist = {
  voiceId: 'f_precise_02',
  name: 'Priya Nair',
  gender: 'female',
  role: 'Domain Expert',
  avatar: 'https://i.pravatar.cc/200?img=45',
}

const DAVID: Panelist = {
  voiceId: 'm_calm_03',
  name: 'David Okonkwo',
  gender: 'male',
  role: 'External',
  avatar: 'https://i.pravatar.cc/200?img=59',
}

const NADIA: Panelist = {
  voiceId: 'f_bright_04',
  name: 'Nadia Haddad',
  gender: 'female',
  role: 'Chair',
  avatar: 'https://i.pravatar.cc/200?img=31',
}

const RYAN: Panelist = {
  voiceId: 'm_even_06',
  name: 'Ryan Cole',
  gender: 'male',
  role: 'Technical',
  avatar: 'https://i.pravatar.cc/200?img=26',
}

const TOM: Panelist = {
  voiceId: 'm_formal_04',
  name: 'Tom Whitfield',
  gender: 'male',
  role: 'Chair',
  avatar: 'https://i.pravatar.cc/200?img=60',
}

const HASSAN: Panelist = {
  voiceId: 'm_brisk_05',
  name: 'Hassan Ali',
  gender: 'male',
  role: 'Technical',
  avatar: 'https://i.pravatar.cc/200?img=65',
}

const ELENA: Panelist = {
  voiceId: 'f_measured_03',
  name: 'Elena Rossi',
  gender: 'female',
  role: 'Domain Expert',
  avatar: 'https://i.pravatar.cc/200?img=44',
}

export const INTERVIEWERS: Record<InterviewerId, Interviewer> = {
  single_male: {
    id: 'single_male',
    label: 'Male interviewer',
    tagline: 'One voice, measured and direct. Best for focused one-on-one practice.',
    icon: 'person-outline',
    isPanel: false,
    listeningLabel: 'AI Interviewer Listening',
    members: [BENJAMIN],
  },

  single_female: {
    id: 'single_female',
    label: 'Female interviewer',
    tagline: 'One voice, warm and conversational. Best for focused one-on-one practice.',
    icon: 'person-outline',
    isPanel: false,
    listeningLabel: 'AI Interviewer Listening',
    members: [{ ...ROSEMARY, role: 'Interviewer' }],
  },

  // The smallest panel: one of each, and the gentlest step up from a one-on-one.
  panel_two: {
    id: 'panel_two',
    label: 'Panel of two',
    tagline: 'One chairs, one presses on the detail. The easiest panel to start with.',
    icon: 'people-outline',
    isPanel: true,
    listeningLabel: 'AI Panel Listening',
    members: [NADIA, RYAN],
  },

  panel_three: {
    id: 'panel_three',
    label: 'Panel of three',
    tagline: 'Mixed panel taking turns, chaired by a woman. Questions come from different angles.',
    icon: 'people-outline',
    isPanel: true,
    listeningLabel: 'AI Panel Listening',
    members: [ROSEMARY, MARCUS, PRIYA],
  },

  // Same size as panel_three, opposite gender balance. Kept as a separate
  // option rather than a toggle so the picker stays a flat list of rosters.
  panel_three_alt: {
    id: 'panel_three_alt',
    label: 'Panel of three',
    tagline: 'Mixed panel taking turns, chaired by a man. Questions come from different angles.',
    icon: 'people-outline',
    isPanel: true,
    listeningLabel: 'AI Panel Listening',
    members: [TOM, HASSAN, ELENA],
  },

  panel_four: {
    id: 'panel_four',
    label: 'Panel of four',
    tagline: 'The full board, including an external examiner. The hardest setting.',
    icon: 'people-circle-outline',
    isPanel: true,
    listeningLabel: 'AI Panel Listening',
    members: [ROSEMARY, MARCUS, PRIYA, DAVID],
  },
}

/** Picker order — singles first, then panels by size, easiest to hardest. */
export const INTERVIEWER_LIST: Interviewer[] = [
  INTERVIEWERS.single_male,
  INTERVIEWERS.single_female,
  INTERVIEWERS.panel_two,
  INTERVIEWERS.panel_three,
  INTERVIEWERS.panel_three_alt,
  INTERVIEWERS.panel_four,
]

/** Matches the first entry in INTERVIEWER_LIST, so the picker opens on it. */
export const DEFAULT_INTERVIEWER: InterviewerId = 'single_male'

export function isValidInterviewer(id: string | null | undefined): id is InterviewerId {
  return !!id && id in INTERVIEWERS
}

/** "2 women, 1 man" — the gender split, for the panel card subtitle. */
export function describeComposition(members: Panelist[]): string {
  const women = members.filter((m) => m.gender === 'female').length
  const men = members.length - women
  const parts: string[] = []
  if (women) parts.push(`${women} ${women === 1 ? 'woman' : 'women'}`)
  if (men) parts.push(`${men} ${men === 1 ? 'man' : 'men'}`)
  return parts.join(', ')
}
