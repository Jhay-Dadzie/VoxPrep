/**
 * Small display formatters shared by the history screens.
 * Every input is nullable because the API returns nulls for sessions that
 * were never completed or never scored.
 */

export const formatDuration = (seconds: number | null | undefined): string => {
  if (seconds == null || seconds < 0) return '--'

  const totalMinutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.round(seconds % 60)

  if (totalMinutes < 60) {
    return totalMinutes > 0 ? `${totalMinutes}m ${remainingSeconds}s` : `${remainingSeconds}s`
  }

  const hours = Math.floor(totalMinutes / 60)
  return `${hours}h ${totalMinutes % 60}m`
}

export const formatDate = (iso: string | null | undefined): string => {
  if (!iso) return '--'

  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '--'

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export const formatDateTime = (iso: string | null | undefined): string => {
  if (!iso) return '--'

  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '--'

  return `${formatDate(iso)} · ${date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })}`
}

export const formatRelative = (iso: string | null | undefined): string => {
  if (!iso) return '--'

  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '--'

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'Just now'

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`

  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`

  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks} week${weeks === 1 ? '' : 's'} ago`

  // Beyond a month a calendar date is more useful than a running count.
  return formatDate(iso)
}

/**
 * Scores are already stored as percentages (DECIMAL(5,2), 0-100), so the
 * stored value is shown exactly as-is with a percent sign - no rounding or
 * rescaling.
 */
export const formatScore = (score: number | null | undefined): string => {
  if (score == null) return '--'
  return `${score}%`
}

/** 0-1 fraction for progress bars and rings. */
export const scoreToPercent = (score: number | null | undefined): number => {
  if (score == null) return 0
  return Math.max(0, Math.min(1, score / 100))
}

/** Shared verdict wording so every screen labels the same score identically. */
export const scoreBand = (
  score: number | null | undefined
): { label: string; tone: 'success' | 'warning' | 'danger' | 'muted' } => {
  if (score == null) return { label: 'Not scored', tone: 'muted' }
  if (score >= 85) return { label: 'Exceptional', tone: 'success' }
  if (score >= 70) return { label: 'Strong', tone: 'success' }
  if (score >= 50) return { label: 'Needs Work', tone: 'warning' }
  return { label: 'Needs Focus', tone: 'danger' }
}
