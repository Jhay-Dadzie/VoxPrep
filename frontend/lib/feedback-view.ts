/**
 * Display helpers for AI feedback.
 *
 * The `feedback` table does not store prose in the columns it looks like it
 * stores prose in: `strengths` and `improvements` are stringified JSON arrays,
 * and `suggestions` holds the grader's metadata envelope
 * (`{ summary, technical_accuracy_score, error_message }`) rather than advice.
 * The history API returns those columns verbatim, so anything that renders them
 * has to unpack them first - printed raw, the user sees a literal
 * `["Clear structure","Good examples"]`.
 *
 * Mirrors the parsing in backend/src/modules/feedback/feedback.mapper.js; if
 * the stored shape changes there, it changes here too.
 */

import { Colors } from '@/constants/theme'
import type { HistoryFeedback } from '@/types/history'
import type { scoreBand } from './format'

type Colours = typeof Colors.light
type Tone = ReturnType<typeof scoreBand>['tone']

const asJson = (value: string): unknown => {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

/** Unpack a stored list column into the lines it was written as. */
export const parseFeedbackList = (value: string | string[] | null | undefined): string[] => {
  if (!value) return []

  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  }

  const parsed = asJson(value)
  if (Array.isArray(parsed)) {
    return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  }

  // Not JSON: a row written as plain text. One entry per line.
  return value
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
}

/** The grader's per-answer summary, dug out of the `suggestions` envelope. */
export const parseFeedbackSummary = (suggestions: string | null | undefined): string | null => {
  if (!suggestions) return null

  const parsed = asJson(suggestions)
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const summary = (parsed as { summary?: unknown }).summary
    return typeof summary === 'string' && summary.trim() ? summary.trim() : null
  }

  // No envelope - the column holds the advice itself.
  const text = suggestions.trim()
  return text || null
}

/** True when grading failed for this answer and the scores are placeholders. */
export const feedbackFailed = (feedback: HistoryFeedback | null | undefined): boolean => {
  if (!feedback?.suggestions) return false

  const parsed = asJson(feedback.suggestions)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false

  const message = (parsed as { error_message?: unknown }).error_message
  return typeof message === 'string' && message.trim().length > 0
}

export type FeedbackInsight = { label: string; items: string[] }

/**
 * The feedback for one answer, grouped for display and already unpacked.
 * Empty sections are dropped so a card never renders a heading over nothing.
 */
export const feedbackInsights = (feedback: HistoryFeedback | null | undefined): FeedbackInsight[] => {
  if (!feedback) return []

  const summary = parseFeedbackSummary(feedback.suggestions)
  const followUp = feedback.follow_up_tip?.trim()

  return [
    { label: 'SUMMARY', items: summary ? [summary] : [] },
    { label: 'STRENGTHS', items: parseFeedbackList(feedback.strengths) },
    { label: 'IMPROVEMENTS', items: parseFeedbackList(feedback.improvements) },
    { label: 'FOLLOW-UP TIP', items: followUp ? [followUp] : [] },
  ].filter((section) => section.items.length > 0)
}

/** Shared score-band palette, so every screen colours the same verdict alike. */
export const toneColor = (tone: Tone, colors: Colours): string =>
  tone === 'success'
    ? colors.success
    : tone === 'warning'
      ? colors.warning
      : tone === 'danger'
        ? colors.danger
        : colors.muted

export const toneBg = (tone: Tone, colors: Colours): string =>
  tone === 'success'
    ? colors.successBg
    : tone === 'warning'
      ? colors.warningBg
      : tone === 'danger'
        ? colors.dangerBg
        : colors.inputBg
