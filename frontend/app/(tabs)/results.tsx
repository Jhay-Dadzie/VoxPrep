import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ThemedText } from '@/components/themed-text'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { useMode } from '@/hooks/mode-context'
import { Colors } from '@/constants/theme'
import { historyService } from '@/services/history'
import { interviewService } from '@/services/interview'
import { setPreparedSession } from '@/lib/prepared-session'
import { toAuthError } from '@/services/error-handler'
import type { HistoryDetail, HistoryQuestion } from '@/types/history'
import { formatDuration, formatScore, scoreBand, scoreToPercent } from '@/lib/format'
import { feedbackFailed, feedbackInsights, toneBg, toneColor } from '@/lib/feedback-view'

type Colours = typeof Colors.light

export default function Results() {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const { copy } = useMode()
  // Present when the user just finished an interview; absent when they simply
  // opened the Results tab, in which case the most recent session is shown.
  const { sessionId } = useLocalSearchParams<{ sessionId?: string }>()

  const [session, setSession] = useState<HistoryDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isGrading, setIsGrading] = useState(false)
  const [isRetaking, setIsRetaking] = useState(false)
  const [isSaved, setIsSaved] = useState(false)

  const isMountedRef = useRef(true)
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (exitTimer.current) clearTimeout(exitTimer.current)
    },
    []
  )

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    setIsSaved(false)

    try {
      let id = sessionId

      // No id to show: fall back to the newest session so the tab reflects the
      // user's actual history instead of claiming they have never interviewed.
      if (!id) {
        const recent = await historyService.list({ page: 1, limit: 1, sort: 'recent' })
        id = recent.data[0]?.id
      }

      if (!id) {
        if (isMountedRef.current) setSession(null)
        return
      }

      const detail = await historyService.getById(id)
      if (!isMountedRef.current) return

      // A written exam is reviewed as a marked paper, not as a graded
      // interview: it has no per-answer feedback for this screen to render.
      if (detail.session_kind === 'exam') {
        router.replace({ pathname: '/exam-results', params: { sessionId: detail.id } })
        return
      }

      setSession(detail)
    } catch (err) {
      if (isMountedRef.current) setError(toAuthError(err).message)
    } finally {
      if (isMountedRef.current) setIsLoading(false)
    }
  }, [sessionId])

  // Refetch on focus: grading finishes server-side, so a session that landed
  // here ungraded can be scored by the time the user comes back to this tab.
  useFocusEffect(
    useCallback(() => {
      isMountedRef.current = true
      load()
      return () => {
        isMountedRef.current = false
      }
    }, [load])
  )

  const graded = useMemo(
    () => (session?.questions ?? []).filter((question) => question.response?.feedback != null),
    [session]
  )

  const answered = useMemo(
    () => (session?.questions ?? []).filter((question) => question.response?.transcribed_text),
    [session]
  )

  /**
   * Answers that were given but carry no usable grade. A plain regrade picks up
   * exactly these, so they are worth naming rather than leaving as blanks the
   * candidate has to notice for themselves.
   */
  const ungraded = useMemo(
    () =>
      answered.filter(
        (question) => !question.response?.feedback || feedbackFailed(question.response.feedback)
      ),
    [answered]
  )

  /**
   * The session row stores only an overall score, so the per-metric breakdown
   * is averaged across every answered question that came back with feedback.
   */
  const metrics = useMemo(() => {
    const feedbacks = graded.map((question) => question.response!.feedback!)
    if (feedbacks.length === 0) return []

    const average = (pick: (scores: (typeof feedbacks)[number]['scores']) => number | null) => {
      const values = feedbacks
        .map((feedback) => pick(feedback.scores))
        .filter((value): value is number => value != null)
      if (values.length === 0) return null
      // A computed mean, not a stored score - round to the 2dp the score
      // columns use so it does not render as a long float.
      return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100
    }

    return [
      { label: 'Relevance', value: average((scores) => scores.relevance), color: colors.tint },
      { label: 'Clarity', value: average((scores) => scores.clarity), color: '#7A4CF0' },
      { label: 'Confidence', value: average((scores) => scores.confidence), color: colors.success },
      { label: 'Completeness', value: average((scores) => scores.completeness), color: colors.warning },
    ].filter((metric) => metric.value != null)
  }, [graded, colors])

  /**
   * Grading runs when the interview ends, but it is a slow model call that is
   * allowed to fail without blocking the candidate. When it did fail there are
   * answers on file and no scores, and the only fix is to ask for it again.
   */
  const scoreNow = async () => {
    if (!session || isGrading) return

    setIsGrading(true)
    setError(null)
    try {
      await interviewService.generateFeedback(session.id)
      await load()
    } catch (err) {
      if (isMountedRef.current) setError(toAuthError(err).message)
    } finally {
      if (isMountedRef.current) setIsGrading(false)
    }
  }

  /**
   * A finished session cannot be reopened, so a retake is a fresh session built
   * from the same source material - no going back to Practice to paste the job
   * description in again.
   */
  const retake = async () => {
    if (!session || isRetaking) return

    setIsRetaking(true)
    setError(null)
    try {
      const prepared = await interviewService.retake(session.id)
      if (!isMountedRef.current) return

      setPreparedSession(prepared)
      router.push({ pathname: '/countdown', params: { sessionId: prepared.session.id } })
    } catch (err) {
      if (isMountedRef.current) setError(toAuthError(err).message)
    } finally {
      if (isMountedRef.current) setIsRetaking(false)
    }
  }

  /**
   * Close out a just-finished interview.
   *
   * There is nothing to send: the session, its answers and its scores were
   * written server-side the moment the interview ended. What the candidate is
   * missing at this point is somewhere to press — an explicit way to put the
   * results down and leave, and confirmation of where they went. The pause is
   * only long enough for that confirmation to be read.
   */
  const saveAndFinish = () => {
    if (isSaved) return

    setIsSaved(true)
    exitTimer.current = setTimeout(() => router.replace('/(tabs)/dashboard'), 900)
  }

  const band = scoreBand(session?.overall_score)
  const justFinished = Boolean(sessionId)

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.card }} edges={['top']}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <ThemedText style={[styles.headerTitle, { color: colors.tint }]}>Results</ThemedText>
        <Pressable style={styles.headerHistoryBtn} onPress={() => router.push('/history')} hitSlop={8}>
          <Ionicons name="time-outline" size={16} color={colors.tint} />
          <ThemedText style={[styles.headerHistoryText, { color: colors.tint }]}>History</ThemedText>
        </Pressable>
      </View>

      {isLoading && !session ? (
        <View style={[styles.centered, { backgroundColor: colors.background }]}>
          <ActivityIndicator color={colors.tint} />
        </View>
      ) : error && !session ? (
        <View style={[styles.centered, { backgroundColor: colors.background }]}>
          <Ionicons name="alert-circle-outline" size={34} color={colors.danger} />
          <ThemedText style={[styles.errorTitle, { color: colors.oppositeColor }]}>
            Could not load your results
          </ThemedText>
          <ThemedText style={[styles.errorBody, { color: colors.subtext }]}>{error}</ThemedText>
          <Pressable style={[styles.retryBtn, { backgroundColor: colors.tint }]} onPress={load}>
            <ThemedText style={styles.retryBtnText}>Try Again</ThemedText>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          style={{ backgroundColor: colors.background }}
          contentContainerStyle={{ padding: 20, paddingBottom: 32, flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
        >
          {!session ? (
            <EmptyState colors={colors} />
          ) : (
            <>
              {error ? (
                <View style={[styles.errorBox, { backgroundColor: colors.dangerBg }]}>
                  <ThemedText style={{ color: colors.danger, fontSize: 13 }}>{error}</ThemedText>
                </View>
              ) : null}

              {/* Straight after a session the hero speaks in the mode's own
                  words — a consular officer is not "our AI recruiter". */}
              <ThemedText style={[styles.heroTitle, { color: colors.tint }]}>
                {justFinished
                  ? copy.resultsHeroTitle
                  : session.session_title || 'Interview Session'}
              </ThemedText>
              <ThemedText style={[styles.heroSub, { color: colors.subtext }]}>
                {justFinished
                  ? copy.resultsHeroSubtitle
                  : session.job_description
                    ? [session.job_description.title, session.job_description.company_name]
                        .filter(Boolean)
                        .join(' · ')
                    : 'Practice session'}
              </ThemedText>

              <View style={[styles.scoreCard, { backgroundColor: colors.card }]}>
                <ThemedText style={[styles.scoreTag, { color: colors.subtext }]}>
                  OVERALL PERFORMANCE
                </ThemedText>
                <View
                  style={[
                    styles.ring,
                    { borderColor: session.overall_score != null ? colors.tint : colors.border },
                  ]}
                >
                  <ThemedText style={[styles.ringNum, { color: colors.tint }]}>
                    {formatScore(session.overall_score)}
                  </ThemedText>
                </View>
                <View style={[styles.goodPill, { backgroundColor: toneBg(band.tone, colors) }]}>
                  <ThemedText style={[styles.goodPillText, { color: toneColor(band.tone, colors) }]}>
                    {band.label}
                  </ThemedText>
                </View>
              </View>

              <View style={[styles.metricsCard, { backgroundColor: colors.card }]}>
                <ThemedText style={[styles.metricsTitle, { color: colors.oppositeColor }]}>
                  Performance Metrics
                </ThemedText>

                {metrics.length > 0
                  ? metrics.map((metric) => (
                      <Metric
                        key={metric.label}
                        label={metric.label}
                        value={formatScore(metric.value)}
                        pct={scoreToPercent(metric.value)}
                        color={metric.color}
                        track={colors.border}
                        text={colors.oppositeColor}
                      />
                    ))
                  : null}

                {/* Grading is a slow model call that is allowed to fail without
                    blocking the candidate, so it can come back partial — or not
                    at all. Either way the answers are on file and can be graded
                    again; what must not happen is the screen quietly implying
                    an ungraded answer was a bad one. */}
                {ungraded.length > 0 ? (
                  <View style={styles.ungraded}>
                    <ThemedText style={{ color: colors.subtext, fontSize: 13, lineHeight: 19 }}>
                      {metrics.length > 0
                        ? `${ungraded.length} of your ${answered.length} answers could not be scored, so they are left out of the totals above.`
                        : 'Your answers are saved, but scoring did not finish. You can run it again now.'}
                    </ThemedText>
                    <Pressable
                      style={[styles.btnPrimary, { backgroundColor: colors.tint, opacity: isGrading ? 0.6 : 1 }]}
                      onPress={scoreNow}
                      disabled={isGrading}
                    >
                      {isGrading ? <ActivityIndicator size="small" color="#fff" /> : null}
                      <ThemedText style={styles.btnPrimaryText}>
                        {isGrading
                          ? 'Scoring...'
                          : metrics.length > 0
                            ? `Score the ${ungraded.length} that failed`
                            : 'Score This Interview'}
                      </ThemedText>
                    </Pressable>
                  </View>
                ) : null}

                {metrics.length === 0 && ungraded.length === 0 ? (
                  <ThemedText style={{ color: colors.subtext, fontSize: 13, lineHeight: 19 }}>
                    No answers were recorded for this session, so there is nothing to score.
                  </ThemedText>
                ) : null}

                <View style={[styles.summaryRow, { borderTopColor: colors.divider }]}>
                  <Stat
                    label="Questions"
                    value={`${session.questions_answered ?? answered.length}/${
                      session.total_questions ?? session.questions.length
                    }`}
                    colors={colors}
                  />
                  <Stat label="Duration" value={formatDuration(session.duration_seconds)} colors={colors} />
                  <Stat
                    label="Status"
                    value={session.status === 'paused' ? 'Paused' : 'Completed'}
                    colors={colors}
                  />
                </View>

                <View style={styles.actionsColumn}>
                  <Pressable
                    style={[styles.btnOutline, { borderColor: colors.tint, opacity: isRetaking ? 0.6 : 1 }]}
                    onPress={retake}
                    disabled={isRetaking}
                  >
                    {isRetaking ? <ActivityIndicator size="small" color={colors.tint} /> : null}
                    <ThemedText style={[styles.btnOutlineText, { color: colors.tint }]}>
                      {isRetaking ? 'Starting...' : 'Retake Session'}
                    </ThemedText>
                  </Pressable>
                  {/* Right after an interview the save button is the primary
                      action, so the review link steps down to an outline. */}
                  <Pressable
                    style={
                      justFinished
                        ? [styles.btnOutline, { borderColor: colors.tint }]
                        : [styles.btnPrimary, { backgroundColor: colors.tint }]
                    }
                    onPress={() => router.push({ pathname: '/history/[id]', params: { id: session.id } })}
                  >
                    <ThemedText
                      style={justFinished ? [styles.btnOutlineText, { color: colors.tint }] : styles.btnPrimaryText}
                    >
                      View Full Review
                    </ThemedText>
                  </Pressable>

                  {justFinished ? (
                    <Pressable
                      style={[
                        styles.btnPrimary,
                        { backgroundColor: isSaved ? colors.success : colors.tint },
                      ]}
                      onPress={saveAndFinish}
                      disabled={isSaved}
                    >
                      <Ionicons
                        name={isSaved ? 'checkmark-circle' : 'bookmark-outline'}
                        size={16}
                        color="#fff"
                      />
                      <ThemedText style={styles.btnPrimaryText}>
                        {isSaved ? 'Saved to your history' : 'Save & Finish'}
                      </ThemedText>
                    </Pressable>
                  ) : null}
                </View>
              </View>

              <View style={styles.sectionHead}>
                <ThemedText style={[styles.sectionTitle, { color: colors.oppositeColor }]}>
                  Question-by-Question{'\n'}Analysis
                </ThemedText>
                <Pressable style={styles.historyLink} onPress={() => router.push('/history')} hitSlop={8}>
                  <ThemedText style={[styles.historyText, { color: colors.tint }]}>
                    View{'\n'}History
                  </ThemedText>
                  <Ionicons name="time-outline" size={16} color={colors.tint} />
                </Pressable>
              </View>

              {session.questions.length === 0 ? (
                <View style={[styles.qCard, { backgroundColor: colors.card }]}>
                  <ThemedText style={{ color: colors.subtext, fontSize: 14 }}>
                    No questions were recorded for this session.
                  </ThemedText>
                </View>
              ) : (
                session.questions.map((question) => (
                  <QuestionCard key={question.id} question={question} colors={colors} />
                ))
              )}

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
                    Get sentiment analysis and keyword optimization tips for your next interview.
                  </ThemedText>
                  <Pressable style={[styles.goPro, { backgroundColor: colors.card }]}>
                    <ThemedText style={[styles.goProText, { color: colors.tint }]}>Go Pro Now</ThemedText>
                  </Pressable>
                </View>
              </LinearGradient>
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

function EmptyState({ colors }: { colors: Colours }) {
  return (
    <View style={styles.emptyContainer}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.brandSoft }]}>
        <Ionicons name="stats-chart" size={32} color={colors.tint} />
      </View>
      <ThemedText style={[styles.emptyTitle, { color: colors.oppositeColor }]}>
        No interviews yet
      </ThemedText>
      <ThemedText style={[styles.emptyBody, { color: colors.subtext }]}>
        Complete an interview session to see your detailed results, performance metrics, and AI-powered
        insights here.
      </ThemedText>
      <Pressable
        style={[styles.startBtn, { backgroundColor: colors.tint }]}
        onPress={() => router.push('/(tabs)/practice')}
      >
        <ThemedText style={styles.startBtnText}>Start Your First Interview</ThemedText>
        <Ionicons name="play" size={16} color="#fff" />
      </Pressable>

      <View style={[styles.tipCard, { backgroundColor: colors.brandSoft, borderColor: colors.border }]}>
        <View style={styles.tipHeader}>
          <Ionicons name="bulb" size={16} color={colors.warning} />
          <ThemedText style={[styles.tipTitle, { color: colors.oppositeColor }]}>
            Getting Started
          </ThemedText>
        </View>
        <ThemedText style={[styles.tipBody, { color: colors.subtext }]}>
          Start with a practice interview to get real-time feedback on your answers, speech clarity,
          confidence, and more.
        </ThemedText>
      </View>
    </View>
  )
}

function Metric({
  label, value, pct, color, track, text,
}: { label: string; value: string; pct: number; color: string; track: string; text: string }) {
  return (
    <View style={styles.metricRow}>
      <View style={styles.metricLabels}>
        <ThemedText style={[styles.metricLabel, { color: text }]}>{label}</ThemedText>
        <ThemedText style={[styles.metricValue, { color }]}>{value}</ThemedText>
      </View>
      <View style={[styles.metricTrack, { backgroundColor: track }]}>
        <View style={[styles.metricFill, { backgroundColor: color, width: `${pct * 100}%` }]} />
      </View>
    </View>
  )
}

function Stat({ label, value, colors }: { label: string; value: string; colors: Colours }) {
  return (
    <View style={styles.stat}>
      <ThemedText style={[styles.statValue, { color: colors.oppositeColor }]}>{value}</ThemedText>
      <ThemedText style={[styles.statLabel, { color: colors.subtext }]}>{label}</ThemedText>
    </View>
  )
}

function QuestionCard({ question, colors }: { question: HistoryQuestion; colors: Colours }) {
  const feedback = question.response?.feedback ?? null
  const score = feedback?.overall_score ?? null
  const band = scoreBand(score)
  const accent = band.tone === 'success' ? colors.success : '#7A4CF0'
  const insights = feedbackInsights(feedback)

  const meta = [
    question.question_type,
    question.response?.response_duration_seconds != null
      ? formatDuration(question.response.response_duration_seconds)
      : null,
  ]
    .filter(Boolean)
    .join(' • ')

  return (
    <View style={[styles.qCard, { backgroundColor: colors.card }]}>
      <View style={styles.qTop}>
        <View style={[styles.qNum, { backgroundColor: colors.brandSoft }]}>
          <ThemedText style={[styles.qNumText, { color: colors.subtext }]}>
            {String(question.question_number).padStart(2, '0')}
          </ThemedText>
        </View>
        <View style={{ flex: 1 }}>
          <ThemedText style={[styles.qTitle, { color: colors.oppositeColor }]}>
            &quot;{question.question_text}&quot;
          </ThemedText>
          {meta.length > 0 ? (
            <ThemedText style={[styles.qMeta, { color: colors.subtext }]}>{meta}</ThemedText>
          ) : null}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <ThemedText style={[styles.qScore, { color: toneColor(band.tone, colors) }]}>
            {formatScore(score)}
          </ThemedText>
          <View style={[styles.qBadge, { backgroundColor: toneBg(band.tone, colors) }]}>
            <ThemedText style={[styles.qBadgeText, { color: toneColor(band.tone, colors) }]}>
              {band.label}
            </ThemedText>
          </View>
        </View>
      </View>

      {insights.length > 0 ? (
        <View style={[styles.insightWrap, { backgroundColor: colors.inputBg }]}>
          <View style={[styles.insightAccent, { backgroundColor: accent }]} />
          <View style={styles.insightInner}>
            <View style={styles.insightHeader}>
              <Ionicons name="sparkles" size={14} color={accent} />
              <ThemedText style={[styles.insightTag, { color: accent }]}>AI INSIGHT</ThemedText>
            </View>
            {insights.map((section) => (
              <View key={section.label} style={{ marginTop: 6 }}>
                <ThemedText style={[styles.insightSubTag, { color: colors.subtext }]}>
                  {section.label}
                </ThemedText>
                {section.items.map((item, index) => (
                  <ThemedText
                    key={`${section.label}-${index}`}
                    style={[styles.insightText, { color: colors.oppositeColor }]}
                  >
                    {section.items.length > 1 ? `• ${item}` : item}
                  </ThemedText>
                ))}
              </View>
            ))}
          </View>
        </View>
      ) : (
        <ThemedText style={[styles.noInsight, { color: colors.muted }]}>
          {!question.response?.transcribed_text
            ? 'You did not answer this question.'
            : feedbackFailed(feedback)
              ? 'The grader could not score this answer — it is left out of your totals.'
              : 'This answer has not been scored yet.'}
        </ThemedText>
      )}
    </View>
  )
}

const RING = 150

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  headerHistoryBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  headerHistoryText: { fontSize: 13, fontWeight: '600' },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  errorTitle: { fontWeight: '700', fontSize: 17, textAlign: 'center' },
  errorBody: { fontSize: 14, textAlign: 'center', marginBottom: 8 },
  retryBtn: { paddingHorizontal: 22, paddingVertical: 11, borderRadius: 999 },
  retryBtnText: { color: '#fff', fontWeight: '700' },
  errorBox: { padding: 12, borderRadius: 10, marginBottom: 14 },

  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 40 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  emptyTitle: { fontWeight: '700', fontSize: 20, marginBottom: 10, textAlign: 'center' },
  emptyBody: { fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: 24 },
  startBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 999, marginBottom: 20, alignSelf: 'center' },
  startBtnText: { color: '#fff', fontWeight: '700' },
  tipCard: { borderRadius: 12, padding: 16, borderWidth: 1, width: '100%' },
  tipHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  tipTitle: { fontWeight: '700' },
  tipBody: { fontSize: 13, lineHeight: 19 },

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

  metricsCard: { borderRadius: 14, padding: 18, marginBottom: 18 },
  metricsTitle: { fontWeight: '700', fontSize: 16, marginBottom: 16 },
  metricRow: { marginBottom: 14 },
  metricLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  metricLabel: { fontSize: 14, fontWeight: '500' },
  metricValue: { fontWeight: '700', fontSize: 13 },
  metricTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  metricFill: { height: '100%', borderRadius: 3 },

  ungraded: { gap: 12, marginBottom: 6 },

  summaryRow: {
    flexDirection: 'row', justifyContent: 'space-around',
    borderTopWidth: 1, paddingTop: 14, marginTop: 4,
  },
  stat: { alignItems: 'center', gap: 2 },
  statValue: { fontWeight: '700', fontSize: 15 },
  statLabel: { fontSize: 11 },

  actionsColumn: { gap: 10, marginTop: 16 },
  btnPrimary: {
    borderRadius: 999, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  btnPrimaryText: { color: '#fff', fontWeight: '700' },
  btnOutline: {
    borderRadius: 999, paddingVertical: 12, borderWidth: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  btnOutlineText: { fontWeight: '700' },

  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '800', flex: 1 },
  historyLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  historyText: { fontSize: 13, fontWeight: '600', textAlign: 'right' },

  qCard: { borderRadius: 14, padding: 14, marginBottom: 12 },
  qTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  qNum: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  qNumText: { fontWeight: '700', fontSize: 13 },
  qTitle: { fontWeight: '700', fontSize: 14, marginBottom: 4 },
  qMeta: { fontSize: 12, textTransform: 'capitalize' },
  qScore: { fontWeight: '800', fontSize: 14, marginBottom: 4 },
  qBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  qBadgeText: { fontSize: 11, fontWeight: '700' },
  noInsight: { fontSize: 13, fontStyle: 'italic', marginTop: 12 },

  insightWrap: { borderRadius: 10, marginTop: 12, overflow: 'hidden', flexDirection: 'row' },
  insightAccent: { width: 4 },
  insightInner: { flex: 1, padding: 12 },
  insightHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  insightTag: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  insightSubTag: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginBottom: 3 },
  insightText: { fontSize: 13, lineHeight: 19 },

  unlockCard: { borderRadius: 14, padding: 16, marginTop: 8, flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  unlockIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#ffffff30', alignItems: 'center', justifyContent: 'center' },
  unlockTitle: { color: '#fff', fontWeight: '800', fontSize: 16, marginBottom: 4 },
  unlockSub: { color: '#ffffffd0', fontSize: 13, lineHeight: 18, marginBottom: 12 },
  goPro: { alignSelf: 'flex-start', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999 },
  goProText: { fontWeight: '700' },
})
