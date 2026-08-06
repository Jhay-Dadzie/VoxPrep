import React, { useCallback, useEffect, useState } from 'react'
import { StyleSheet, View, ScrollView, Pressable, ActivityIndicator } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ThemedText } from '@/components/themed-text'
import { ModeBadge } from '@/components/mode-badge'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { useMode } from '@/hooks/mode-context'
import { useSession } from '@/hooks/session-context'
import {
  fetchSessionResults,
  generateQuestions,
  analyseCv,
  ApiError,
  type SessionResults,
  type QuestionResult,
} from '@/services/api'
import { Colors } from '@/constants/theme'

/**
 * Session feedback.
 *
 * Wording, the structural metric, and the per-question breakdown all come from
 * the active mode — the same session reads as an interview, an exam, or a viva
 * depending on what the user picked. The question data is still placeholder;
 * it moves to the backend once sessions are graded for real.
 */
export default function Results() {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const { mode, copy, modeId } = useMode()
  const { session, start, setCvAnalysis } = useSession()
  const [results, setResults] = useState<SessionResults | null>(null)
  const [loading, setLoading] = useState(false)
  const [retaking, setRetaking] = useState(false)
  const [retakeError, setRetakeError] = useState<string | null>(null)
  const [cvChecking, setCvChecking] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const sessionId = session?.sessionId ?? null

  // Refetch on focus rather than on mount: this is a tab, so it stays mounted
  // and would otherwise keep showing the previous session's scores.
  useFocusEffect(
    useCallback(() => {
      if (!sessionId) {
        setResults(null)
        return
      }
      let cancelled = false
      setLoading(true)
      setLoadError(null)
      fetchSessionResults(sessionId)
        .then((data) => {
          if (!cancelled) setResults(data)
        })
        .catch((err) => {
          // Swallowing this made every failure look identical to "no session",
          // which is exactly what made the screen impossible to diagnose.
          if (cancelled) return
          setResults(null)
          setLoadError(
            err instanceof ApiError
              ? `${err.message} (${err.status || 'network'})`
              : 'Could not load these results.',
          )
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
      return () => {
        cancelled = true
      }
    }, [sessionId]),
  )

  const overall = results?.overall
  // No invented fallback: an unscored session shows a dash, not a plausible number.
  const scorePct = overall?.score != null ? Math.round(overall.score) : null
  const answered = results?.questions.filter((q) => q.answered) ?? []

  const cv = session?.cvAnalysis ?? null
  // Only worth showing when the CV would actually cost them the role. A CV that
  // already fits gets no unsolicited advice.
  const showCvPrompt = cv !== null && !cv.matchesRole

  /**
   * Compare the CV against the role, once, after the interview is finished.
   *
   * Skipped entirely unless this mode takes a CV and one was supplied.
   */
  useEffect(() => {
    if (!session?.source || !session?.secondarySource) return
    if (!mode.secondarySource) return
    if (session.cvAnalysis || cvChecking) return
    if (answered.length === 0) return

    let cancelled = false
    setCvChecking(true)
    analyseCv({
      mode: modeId,
      source: session.source,
      secondarySource: session.secondarySource,
    })
      .then((analysis) => {
        if (!cancelled) setCvAnalysis(analysis)
      })
      .catch(() => {
        // Advice failing is not worth an error on the results screen.
      })
      .finally(() => {
        if (!cancelled) setCvChecking(false)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.source, session?.secondarySource, session?.cvAnalysis, answered.length])

  /**
   * Start a fresh attempt against the same role.
   *
   * A retake generates a new question set and a new session rather than
   * replaying the old one: reusing the finished session would attach a second
   * set of answers to questions that already have scores, and the session
   * average would silently blend two attempts.
   */
  const handleRetake = async () => {
    if (retaking) return
    setRetakeError(null)

    const source = session?.source
    if (!source) {
      // Nothing to regenerate from — usually because the app reloaded.
      router.replace('/(tabs)/practice')
      return
    }

    setRetaking(true)
    try {
      const fresh = await generateQuestions({
        mode: modeId,
        source,
        secondarySource: session?.secondarySource ?? null,
        count: 10,
      })
      start({
        sessionId: fresh.sessionId,
        questions: fresh.questions,
        source,
        secondarySource: session?.secondarySource ?? null,
      })
      setResults(null)
      router.replace('/countdown')
    } catch (err) {
      setRetakeError(
        err instanceof ApiError ? err.message : 'Could not start a new session. Please try again.',
      )
    } finally {
      setRetaking(false)
    }
  }

  /**
   * Nothing to report yet.
   *
   * This used to render a fabricated 72% with sample questions, which was
   * indistinguishable from the app being broken — and actively misleading in a
   * demo. An empty state says what is true and points at the fix.
   */
  if (!loading && !results) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.card }} edges={['top']}>
        <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <ThemedText style={[styles.headerTitle, { color: colors.tint }]}>{copy.resultsTitle}</ThemedText>
          <View style={{ flex: 1 }} />
          <ModeBadge />
        </View>

        <View style={[styles.empty, { backgroundColor: colors.background }]}>
          <View
            style={[
              styles.emptyIcon,
              { backgroundColor: loadError ? colors.dangerBg : colors.brandSoft },
            ]}
          >
            <Ionicons
              name={loadError ? 'alert-circle-outline' : 'bar-chart-outline'}
              size={30}
              color={loadError ? colors.danger : colors.tint}
            />
          </View>

          <ThemedText style={[styles.emptyTitle, { color: colors.oppositeColor }]}>
            {loadError ? 'Could not load results' : 'No feedback yet'}
          </ThemedText>

          <ThemedText style={[styles.emptyBody, { color: colors.subtext }]}>
            {loadError
              ? loadError
              : sessionId
                ? 'This session has no scored answers yet. Scoring finishes a few seconds after each answer is submitted.'
                : `Finish a ${copy.sessionNoun} and your scores, transcripts and per-question feedback will appear here.`}
          </ThemedText>

          {/* The session id is the single most useful fact when this screen is
              not showing what it should, so make it visible rather than hidden
              in a log the user cannot reach. */}
          {sessionId && (
            <ThemedText style={{ color: colors.muted, fontSize: 11, marginBottom: 18 }}>
              session {sessionId.slice(0, 8)}…
            </ThemedText>
          )}

          <Pressable
            style={[styles.emptyCta, { backgroundColor: colors.tint }]}
            onPress={() => router.replace('/(tabs)/practice')}
            accessibilityRole="button"
          >
            <ThemedText style={styles.btnPrimaryText}>{copy.practiceCta}</ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.card }} edges={['top']}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <ThemedText style={[styles.headerTitle, { color: colors.tint }]}>{copy.resultsTitle}</ThemedText>
        <View style={{ flex: 1 }} />
        <ModeBadge />
      </View>

      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        <ThemedText style={[styles.heroTitle, { color: colors.tint }]}>
          {copy.resultsHeroTitle}
        </ThemedText>
        <ThemedText style={[styles.heroSub, { color: colors.subtext }]}>
          {copy.resultsHeroSubtitle}
        </ThemedText>

        <View style={[styles.scoreCard, { backgroundColor: colors.card }]}>
          <ThemedText style={[styles.scoreTag, { color: colors.subtext }]}>OVERALL PERFORMANCE</ThemedText>
          <View style={[styles.ring, { borderColor: colors.tint }]}>
            {loading ? (
              <ActivityIndicator color={colors.tint} />
            ) : (
              <ThemedText style={[styles.ringNum, { color: colors.tint }]}>
                {scorePct != null ? `${scorePct}%` : '—'}
              </ThemedText>
            )}
          </View>
          {scorePct != null ? (
            <View style={[styles.goodPill, { backgroundColor: verdict(scorePct, colors).bg }]}>
              <ThemedText style={[styles.goodPillText, { color: verdict(scorePct, colors).fg }]}>
                {verdict(scorePct, colors).label}
              </ThemedText>
            </View>
          ) : (
            <View style={[styles.goodPill, { backgroundColor: colors.brandSoft }]}>
              <ThemedText style={[styles.goodPillText, { color: colors.tint }]}>
                Scoring in progress
              </ThemedText>
            </View>
          )}
          {results && (
            <ThemedText style={{ color: colors.muted, fontSize: 12, marginTop: 10 }}>
              {results.questionsAnswered} of {results.totalQuestions} answered
            </ThemedText>
          )}
        </View>

        {/* Delivery stats are pure transcript maths, so these are the first two
            numbers that become real once transcription lands. */}
        <View style={styles.deliveryRow}>
          <DeliveryTile
            icon="chatbubble-ellipses-outline"
            value={results ? String(results.delivery.fillerCount) : '—'}
            label="Filler words"
            hint="Aim for under 8"
            tone={
              results && results.delivery.fillerCount > 8 ? colors.warning : colors.success
            }
            toneBg={
              results && results.delivery.fillerCount > 8 ? colors.warningBg : colors.successBg
            }
            colors={colors}
          />
          <DeliveryTile
            icon="speedometer-outline"
            value={results?.delivery.wordsPerMinute != null ? String(results.delivery.wordsPerMinute) : '—'}
            label="Words per minute"
            hint="Ideal range 130–150"
            tone={inPaceRange(results?.delivery.wordsPerMinute) ? colors.success : colors.warning}
            toneBg={inPaceRange(results?.delivery.wordsPerMinute) ? colors.successBg : colors.warningBg}
            colors={colors}
          />
        </View>

        <View style={[styles.metricsCard, { backgroundColor: colors.card }]}>
          <ThemedText style={[styles.metricsTitle, { color: colors.oppositeColor }]}>Performance Metrics</ThemedText>

          <Metric label="Clarity" score={overall?.clarity ?? null} color={colors.tint} track={colors.border} sub={colors.subtext} text={colors.oppositeColor} />
          <Metric label={copy.structureCheckLabel} score={overall?.completeness ?? null} color="#7A4CF0" track={colors.border} sub={colors.subtext} text={colors.oppositeColor} />
          <Metric label="Confidence" score={overall?.confidence ?? null} color={colors.success} track={colors.border} sub={colors.subtext} text={colors.oppositeColor} />

          {/* Results are written as each answer is scored, so there is nothing
              to "save" — saying so is more useful than a button that lies. */}
          {results && (
            <View style={styles.savedRow}>
              <Ionicons name="cloud-done-outline" size={14} color={colors.success} />
              <ThemedText style={{ color: colors.success, fontSize: 12, fontWeight: '600' }}>
                Saved to your history
              </ThemedText>
            </View>
          )}

          {retakeError && (
            <View style={[styles.retakeError, { backgroundColor: colors.dangerBg }]}>
              <Ionicons name="alert-circle" size={14} color={colors.danger} />
              <ThemedText style={{ color: colors.danger, fontSize: 12, flex: 1 }}>
                {retakeError}
              </ThemedText>
            </View>
          )}

          <View style={styles.actionsRow}>
            <Pressable
              style={[styles.btnPrimary, { backgroundColor: colors.tint }]}
              onPress={() => router.replace('/(tabs)/dashboard')}
              accessibilityRole="button"
            >
              <ThemedText style={styles.btnPrimaryText}>Done</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.btnOutline, { borderColor: colors.tint }, retaking && { opacity: 0.5 }]}
              onPress={handleRetake}
              disabled={retaking}
              accessibilityRole="button"
              accessibilityState={{ disabled: retaking, busy: retaking }}
            >
              {retaking ? (
                <ActivityIndicator color={colors.tint} size="small" />
              ) : (
                <ThemedText style={[styles.btnOutlineText, { color: colors.tint }]}>{copy.retakeCta}</ThemedText>
              )}
            </Pressable>
          </View>
        </View>

        {/* Post-interview only, and only when the CV would actually cost them
            the role — see buildCvAnalysisPrompt on the server. */}
        {showCvPrompt && (
          <Pressable
            style={[styles.cvCard, { backgroundColor: colors.card, borderColor: colors.warning }]}
            onPress={() => router.push('/cv-gap')}
            accessibilityRole="button"
          >
            <View style={[styles.cvIcon, { backgroundColor: colors.warningBg }]}>
              <Ionicons name="document-text" size={20} color={colors.warning} />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={[styles.cvTitle, { color: colors.oppositeColor }]}>
                Your CV doesn&apos;t match this role yet
              </ThemedText>
              <ThemedText style={[styles.cvBody, { color: colors.subtext }]}>
                {cv?.verdict ??
                  'Some of what this role asks for is missing or too vaguely stated.'}
              </ThemedText>
              <ThemedText style={[styles.cvCount, { color: colors.warning }]}>
                {cv!.missing.length + cv!.vague.length} things to fix
                {cv?.matchScore != null ? ` · ${cv.matchScore}% match` : ''}
              </ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        )}

        {cvChecking && (
          <View style={[styles.cvCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <ActivityIndicator color={colors.tint} />
            <ThemedText style={{ color: colors.subtext, fontSize: 13, flex: 1 }}>
              Checking your CV against this role…
            </ThemedText>
          </View>
        )}

        {cv?.matchesRole && (
          <View style={[styles.cvCard, { backgroundColor: colors.card, borderColor: colors.success }]}>
            <View style={[styles.cvIcon, { backgroundColor: colors.successBg }]}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={[styles.cvTitle, { color: colors.oppositeColor }]}>
                Your CV fits this role
              </ThemedText>
              <ThemedText style={[styles.cvBody, { color: colors.subtext }]}>
                {cv.verdict ?? 'No rewrite needed — it already evidences what the role asks for.'}
              </ThemedText>
            </View>
          </View>
        )}

        <View style={styles.sectionHead}>
          <ThemedText style={[styles.sectionTitle, { color: colors.oppositeColor }]}>
            Question-by-Question{'\n'}Analysis
          </ThemedText>
          <View style={styles.historyLink}>
            <ThemedText style={[styles.historyText, { color: colors.tint }]}>View{'\n'}History</ThemedText>
            <Ionicons name="time-outline" size={16} color={colors.tint} />
          </View>
        </View>

        {answered.map((q) => (
          <RealQuestionCard key={q.questionId} q={q} colors={colors} />
        ))}

        <LinearGradient
          colors={[colors.tint, '#7A4CF0']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.unlockCard}
        >
          <View style={styles.unlockIconWrap}>
            <Ionicons name="trending-up" size={22} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.unlockTitle}>Unlock Deep Analytics</ThemedText>
            <ThemedText style={styles.unlockSub}>
              Get sentiment analysis and keyword optimization tips for your next {copy.sessionNoun}.
            </ThemedText>
            <Pressable style={[styles.goPro, { backgroundColor: colors.card }]}>
              <ThemedText style={[styles.goProText, { color: colors.tint }]}>Go Pro Now</ThemedText>
            </Pressable>
          </View>
        </LinearGradient>
      </ScrollView>
    </SafeAreaView>
  )
}

function DeliveryTile({
  icon, value, label, hint, tone, toneBg, colors,
}: {
  icon: any; value: string; label: string; hint: string
  tone: string; toneBg: string; colors: any
}) {
  return (
    <View style={[styles.deliveryTile, { backgroundColor: colors.card }]}>
      <View style={[styles.deliveryIcon, { backgroundColor: toneBg }]}>
        <Ionicons name={icon} size={16} color={tone} />
      </View>
      <ThemedText style={[styles.deliveryValue, { color: colors.oppositeColor }]}>{value}</ThemedText>
      <ThemedText style={[styles.deliveryLabel, { color: colors.subtext }]}>{label}</ThemedText>
      <ThemedText style={[styles.deliveryHint, { color: colors.muted }]}>{hint}</ThemedText>
    </View>
  )
}

/**
 * Scores arrive 0-100 but the design shows them out of ten.
 * A null score renders as an empty bar rather than a fabricated value.
 */
function Metric({
  label, score, color, track, sub, text,
}: { label: string; score: number | null; color: string; track: string; sub: string; text: string }) {
  const outOfTen = score != null ? Math.round((score / 10) * 10) / 10 : null
  return (
    <View style={styles.metricRow}>
      <View style={styles.metricLabels}>
        <ThemedText style={[styles.metricLabel, { color: text }]}>{label}</ThemedText>
        <ThemedText style={[styles.metricValue, { color }]}>
          {outOfTen != null ? `${outOfTen}/10` : '—'}
        </ThemedText>
      </View>
      <View style={[styles.metricTrack, { backgroundColor: track }]}>
        <View
          style={[
            styles.metricFill,
            { backgroundColor: color, width: `${score != null ? Math.min(100, Math.max(0, score)) : 0}%` },
          ]}
        />
      </View>
    </View>
  )
}

/** Verdict pill under the score ring. */
function verdict(score: number, colors: any) {
  if (score >= 80) return { label: 'Excellent!', fg: colors.success, bg: colors.successBg }
  if (score >= 65) return { label: 'Good Job!', fg: colors.success, bg: colors.successBg }
  if (score >= 50) return { label: 'Needs Work', fg: colors.warning, bg: colors.warningBg }
  return { label: 'Keep Practising', fg: colors.danger, bg: colors.dangerBg }
}

function inPaceRange(wpm: number | null | undefined) {
  return wpm != null && wpm >= 130 && wpm <= 150
}

/**
 * A real graded answer.
 *
 * Shows what was actually said alongside the critique — feedback without the
 * transcript beside it is hard to act on, because you cannot remember exactly
 * how you phrased it.
 */
function RealQuestionCard({ q, colors }: { q: QuestionResult; colors: any }) {
  const score = q.scores?.overall ?? null
  const tone = score == null ? colors.muted : score >= 75 ? colors.success : score >= 55 ? colors.warning : colors.danger
  const toneBg = score == null ? colors.brandSoft : score >= 75 ? colors.successBg : score >= 55 ? colors.warningBg : colors.dangerBg
  const badge = score == null ? 'Not scored' : score >= 85 ? 'Exceptional' : score >= 70 ? 'Strong' : score >= 55 ? 'Fair' : 'Needs Work'

  return (
    <View style={[styles.qCard, { backgroundColor: colors.card }]}>
      <View style={styles.qTop}>
        <View style={[styles.qNum, { backgroundColor: colors.brandSoft }]}>
          <ThemedText style={[styles.qNumText, { color: colors.subtext }]}>
            {String(q.questionNumber).padStart(2, '0')}
          </ThemedText>
        </View>
        <View style={{ flex: 1 }}>
          <ThemedText style={[styles.qTitle, { color: colors.oppositeColor }]}>
            &quot;{q.questionText}&quot;
          </ThemedText>
          <ThemedText style={[styles.qMeta, { color: colors.subtext }]}>
            {capitalise(q.questionType)} Question
            {q.durationSeconds ? ` • ${formatDuration(q.durationSeconds)}` : ''}
          </ThemedText>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <ThemedText style={[styles.qScore, { color: tone }]}>
            {score == null ? '—' : `${Math.round(score / 10 * 10) / 10}/10`}
          </ThemedText>
          <View style={[styles.qBadge, { backgroundColor: toneBg }]}>
            <ThemedText style={[styles.qBadgeText, { color: tone }]}>{badge}</ThemedText>
          </View>
        </View>
      </View>

      {q.transcript && (
        <View style={[styles.answerWrap, { backgroundColor: colors.inputBg }]}>
          <ThemedText style={[styles.answerTag, { color: colors.muted }]}>YOU SAID</ThemedText>
          <ThemedText style={[styles.answerText, { color: colors.subtext }]} numberOfLines={4}>
            &quot;{q.transcript}&quot;
          </ThemedText>
        </View>
      )}

      {(q.strengths || q.improvements || q.suggestions) && (
        <View style={[styles.insightWrap, { backgroundColor: colors.inputBg }]}>
          <View style={[styles.insightAccent, { backgroundColor: tone }]} />
          <View style={styles.insightInner}>
            <View style={styles.insightHeader}>
              <Ionicons name="sparkles" size={14} color={tone} />
              <ThemedText style={[styles.insightTag, { color: tone }]}>AI INSIGHT</ThemedText>
            </View>
            {q.strengths && (
              <ThemedText style={[styles.insightText, { color: colors.oppositeColor }]}>
                {q.strengths}
              </ThemedText>
            )}
            {q.improvements && (
              <ThemedText style={[styles.insightText, { color: colors.oppositeColor, marginTop: 8 }]}>
                {q.improvements}
              </ThemedText>
            )}
            {q.suggestions && (
              <ThemedText style={[styles.insightText, { color: colors.subtext, marginTop: 8, fontStyle: 'italic' }]}>
                {q.suggestions}
              </ThemedText>
            )}
          </View>
        </View>
      )}
    </View>
  )
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

const RING = 150

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
  headerTitle: { fontSize: 16, fontWeight: '700' },

  heroTitle: { fontSize: 26, fontWeight: '800', textAlign: 'center', marginTop: 6, marginBottom: 10 },
  heroSub: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 22, paddingHorizontal: 24 },

  scoreCard: { borderRadius: 14, padding: 20, alignItems: 'center', marginBottom: 16 },
  scoreTag: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 16 },
  ring: {
    width: RING, height: RING, borderRadius: RING / 2,
    borderWidth: 10, alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
  },
  ringNum: { fontSize: 30, fontWeight: '800', lineHeight: 36, includeFontPadding: false, textAlignVertical: 'center' },
  goodPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999 },
  goodPillText: { fontWeight: '700', fontSize: 13 },

  deliveryRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  deliveryTile: { flex: 1, borderRadius: 14, padding: 14 },
  deliveryIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  deliveryValue: { fontSize: 22, fontWeight: '800' },
  deliveryLabel: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  deliveryHint: { fontSize: 11, marginTop: 4 },

  metricsCard: { borderRadius: 14, padding: 18, marginBottom: 18 },
  metricsTitle: { fontWeight: '700', fontSize: 16, marginBottom: 16 },
  metricRow: { marginBottom: 14 },
  metricLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  metricLabel: { fontSize: 14, fontWeight: '500' },
  metricValue: { fontWeight: '700', fontSize: 13 },
  metricTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  metricFill: { height: '100%', borderRadius: 3 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 4 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  emptyTitle: { fontSize: 18, fontWeight: '800' },
  emptyBody: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 6, marginBottom: 22 },
  emptyCta: { borderRadius: 999, paddingHorizontal: 28, paddingVertical: 14 },

  savedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  retakeError: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 8, padding: 10, marginTop: 10 },
  actionsRow: { flexDirection: 'row', gap: 12, marginTop: 10 },
  btnPrimary: { flex: 1, borderRadius: 999, paddingVertical: 12, alignItems: 'center' },
  btnPrimaryText: { color: '#fff', fontWeight: '700' },
  btnOutline: { flex: 1, borderRadius: 999, paddingVertical: 12, alignItems: 'center', borderWidth: 1 },
  btnOutlineText: { fontWeight: '700' },

  cvCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 18,
  },
  cvIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  cvTitle: { fontSize: 14, fontWeight: '700' },
  cvBody: { fontSize: 12, lineHeight: 17, marginTop: 3 },
  cvCount: { fontSize: 11, fontWeight: '700', marginTop: 6 },

  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '800', flex: 1 },
  historyLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  historyText: { fontSize: 13, fontWeight: '600', textAlign: 'right' },

  qCard: { borderRadius: 14, padding: 14, marginBottom: 12 },
  qTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  qNum: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  qNumText: { fontWeight: '700', fontSize: 13 },
  qTitle: { fontWeight: '700', fontSize: 14, marginBottom: 4 },
  qMeta: { fontSize: 12 },
  qScore: { fontWeight: '800', fontSize: 14, marginBottom: 4 },
  qBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  qBadgeText: { fontSize: 11, fontWeight: '700' },

  answerWrap: { borderRadius: 10, padding: 12, marginTop: 12 },
  answerTag: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginBottom: 5 },
  answerText: { fontSize: 13, lineHeight: 19, fontStyle: 'italic' },

  insightWrap: { borderRadius: 10, marginTop: 12, overflow: 'hidden', flexDirection: 'row' },
  insightAccent: { width: 4 },
  insightInner: { flex: 1, padding: 12 },
  insightHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  insightTag: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  insightText: { fontSize: 13, lineHeight: 19 },

  unlockCard: { borderRadius: 14, padding: 16, marginTop: 8, flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  unlockIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#ffffff30', alignItems: 'center', justifyContent: 'center' },
  unlockTitle: { color: '#fff', fontWeight: '800', fontSize: 16, marginBottom: 4 },
  unlockSub: { color: '#ffffffd0', fontSize: 13, lineHeight: 18, marginBottom: 12 },
  goPro: { alignSelf: 'flex-start', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999 },
  goProText: { fontWeight: '700' },
})
