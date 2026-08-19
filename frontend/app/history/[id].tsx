import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { router, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ThemedText } from '@/components/themed-text'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { Colors } from '@/constants/theme'
import { historyService } from '@/services/history'
import { interviewService } from '@/services/interview'
import { setPreparedSession } from '@/lib/prepared-session'
import { toAuthError } from '@/services/error-handler'
import { HistoryDetail, HistoryQuestion } from '@/types/history'
import {
  formatDateTime,
  formatDuration,
  formatScore,
  scoreBand,
  scoreToPercent,
} from '@/lib/format'
import { feedbackInsights, toneBg, toneColor } from '@/lib/feedback-view'

type Colours = typeof Colors.light

export default function HistoryDetailScreen() {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const { id } = useLocalSearchParams<{ id: string }>()

  const [session, setSession] = useState<HistoryDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [notes, setNotes] = useState('')
  const [isSavingNotes, setIsSavingNotes] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)
  const [isRetaking, setIsRetaking] = useState(false)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const load = useCallback(async () => {
    if (!id) return

    setIsLoading(true)
    setError(null)
    try {
      const result = await historyService.getById(id)
      if (!isMountedRef.current) return
      setSession(result)
      setNotes(result.notes ?? '')
    } catch (err) {
      if (!isMountedRef.current) return
      setError(toAuthError(err).message)
    } finally {
      if (isMountedRef.current) setIsLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  /**
   * The session row stores only an overall score, so the per-metric breakdown
   * shown on the results screen is averaged across every answered question
   * that has feedback.
   */
  const metrics = useMemo(() => {
    if (!session) return []

    const feedbacks = session.questions
      .map((question) => question.response?.feedback)
      .filter((feedback): feedback is NonNullable<typeof feedback> => feedback != null)

    if (feedbacks.length === 0) return []

    const average = (pick: (scores: NonNullable<typeof feedbacks>[number]['scores']) => number | null) => {
      const values = feedbacks
        .map((feedback) => pick(feedback.scores))
        .filter((value): value is number => value != null)
      if (values.length === 0) return null
      // Computed mean, not a stored score - round to the same 2dp the score
      // columns use so it does not render as a long float.
      return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100
    }

    return [
      { label: 'Relevance', value: average((scores) => scores.relevance), color: colors.tint },
      { label: 'Clarity', value: average((scores) => scores.clarity), color: '#7A4CF0' },
      { label: 'Confidence', value: average((scores) => scores.confidence), color: colors.success },
      { label: 'Completeness', value: average((scores) => scores.completeness), color: colors.warning },
    ].filter((metric) => metric.value != null)
  }, [session, colors])

  /**
   * Run this interview again.
   *
   * The finished session cannot be reopened, so the server starts a new one on
   * the same source material and the user goes straight into it — no going back
   * to the setup screen to paste the job description a second time.
   */
  const retake = async () => {
    if (!id || isRetaking) return

    setIsRetaking(true)
    setError(null)
    try {
      const prepared = await interviewService.retake(id)
      if (!isMountedRef.current) return

      setPreparedSession(prepared)
      router.push({ pathname: '/countdown', params: { sessionId: prepared.session.id } })
    } catch (err) {
      if (isMountedRef.current) setError(toAuthError(err).message)
    } finally {
      if (isMountedRef.current) setIsRetaking(false)
    }
  }

  const saveNotes = async () => {
    if (!id) return

    setIsSavingNotes(true)
    setNotesSaved(false)
    try {
      const saved = await historyService.updateNotes(id, notes)
      if (!isMountedRef.current) return
      setNotes(saved ?? '')
      setSession((previous) => (previous ? { ...previous, notes: saved } : previous))
      setNotesSaved(true)
    } catch (err) {
      if (isMountedRef.current) setError(toAuthError(err).message)
    } finally {
      if (isMountedRef.current) setIsSavingNotes(false)
    }
  }

  const toggleArchive = async () => {
    if (!id || !session) return

    const next = !session.is_archived
    setSession({ ...session, is_archived: next })
    try {
      await historyService.setArchived(id, next)
    } catch (err) {
      if (isMountedRef.current) {
        setSession((previous) => (previous ? { ...previous, is_archived: !next } : previous))
        setError(toAuthError(err).message)
      }
    }
  }

  const confirmDelete = () => {
    Alert.alert(
      'Delete session?',
      'This permanently removes the session, its answers and its feedback. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!id) return
            try {
              await historyService.remove(id)
              router.back()
            } catch (err) {
              if (isMountedRef.current) setError(toAuthError(err).message)
            }
          },
        },
      ]
    )
  }

  const band = scoreBand(session?.overall_score)

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.card }} edges={['top']}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.tint} />
        </Pressable>
        <ThemedText style={[styles.headerTitle, { color: colors.tint }]} numberOfLines={1}>
          Session Review
        </ThemedText>
        <View style={styles.headerActions}>
          {session && (
            <>
              <Pressable onPress={toggleArchive} hitSlop={8}>
                <Ionicons
                  name={session.is_archived ? 'archive' : 'archive-outline'}
                  size={20}
                  color={colors.subtext}
                />
              </Pressable>
              <Pressable onPress={confirmDelete} hitSlop={8}>
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
              </Pressable>
            </>
          )}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.tint} />
        </View>
      ) : error && !session ? (
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={34} color={colors.danger} />
          <ThemedText style={[styles.errorTitle, { color: colors.oppositeColor }]}>
            Could not load this session
          </ThemedText>
          <ThemedText style={[styles.errorBody, { color: colors.subtext }]}>{error}</ThemedText>
          <Pressable style={[styles.retryBtn, { backgroundColor: colors.tint }]} onPress={load}>
            <ThemedText style={styles.retryBtnText}>Try Again</ThemedText>
          </Pressable>
        </View>
      ) : session ? (
        <ScrollView
          style={{ backgroundColor: colors.background }}
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {error && (
            <View style={[styles.errorBox, { backgroundColor: colors.dangerBg }]}>
              <ThemedText style={{ color: colors.danger, fontSize: 13 }}>{error}</ThemedText>
            </View>
          )}

          <ThemedText style={[styles.heroTitle, { color: colors.tint }]}>
            {session.session_title || 'Interview Session'}
          </ThemedText>
          <ThemedText style={[styles.heroSub, { color: colors.subtext }]}>
            {session.job_description
              ? [session.job_description.title, session.job_description.company_name]
                  .filter(Boolean)
                  .join(' · ')
              : 'Practice session'}
            {'\n'}
            {formatDateTime(session.started_at)}
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

            {metrics.length > 0 ? (
              metrics.map((metric) => (
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
            ) : (
              <ThemedText style={{ color: colors.subtext, fontSize: 13 }}>
                No AI feedback was recorded for this session.
              </ThemedText>
            )}

            <View style={[styles.summaryRow, { borderTopColor: colors.divider }]}>
              <Stat
                label="Questions"
                value={`${session.questions_answered ?? 0}/${session.total_questions ?? 0}`}
                colors={colors}
              />
              <Stat label="Duration" value={formatDuration(session.duration_seconds)} colors={colors} />
              <Stat
                label="Status"
                value={session.status === 'paused' ? 'Paused' : 'Completed'}
                colors={colors}
              />
            </View>

            <View style={styles.actionsRow}>
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
            </View>
          </View>

          {session.job_description?.key_skills && session.job_description.key_skills.length > 0 && (
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <ThemedText style={[styles.cardTitle, { color: colors.oppositeColor }]}>
                Role Focus
              </ThemedText>
              <View style={styles.skillRow}>
                {session.job_description.key_skills.map((skill) => (
                  <View key={skill} style={[styles.skillChip, { backgroundColor: colors.brandSoft }]}>
                    <ThemedText style={[styles.skillChipText, { color: colors.tint }]}>
                      {skill}
                    </ThemedText>
                  </View>
                ))}
              </View>
            </View>
          )}

          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <ThemedText style={[styles.cardTitle, { color: colors.oppositeColor }]}>My Notes</ThemedText>
            <TextInput
              style={[
                styles.notesInput,
                {
                  backgroundColor: colors.inputBg,
                  color: colors.oppositeColor,
                  borderColor: colors.border,
                },
              ]}
              value={notes}
              onChangeText={(text) => {
                setNotes(text)
                setNotesSaved(false)
              }}
              placeholder="Jot down what to work on next time..."
              placeholderTextColor={colors.muted}
              multiline
              maxLength={2000}
              textAlignVertical="top"
            />
            <View style={styles.notesFooter}>
              <ThemedText style={[styles.charCount, { color: colors.muted }]}>
                {notes.length}/2000
              </ThemedText>
              <View style={styles.notesActions}>
                {notesSaved && (
                  <ThemedText style={[styles.savedText, { color: colors.success }]}>Saved</ThemedText>
                )}
                <Pressable
                  onPress={saveNotes}
                  disabled={isSavingNotes}
                  style={[
                    styles.saveBtn,
                    { backgroundColor: colors.tint, opacity: isSavingNotes ? 0.6 : 1 },
                  ]}
                >
                  {isSavingNotes ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <ThemedText style={styles.saveBtnText}>Save Notes</ThemedText>
                  )}
                </Pressable>
              </View>
            </View>
          </View>

          <View style={styles.sectionHead}>
            <ThemedText style={[styles.sectionTitle, { color: colors.oppositeColor }]}>
              Question-by-Question{'\n'}Analysis
            </ThemedText>
          </View>

          {session.questions.length === 0 ? (
            <View style={[styles.card, { backgroundColor: colors.card }]}>
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
        </ScrollView>
      ) : null}
    </SafeAreaView>
  )
}

function Metric({
  label,
  value,
  pct,
  color,
  track,
  text,
}: {
  label: string
  value: string
  pct: number
  color: string
  track: string
  text: string
}) {
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
  const [expanded, setExpanded] = useState(false)
  const feedback = question.response?.feedback
  const score = feedback?.overall_score ?? null
  const band = scoreBand(score)
  const accent = band.tone === 'success' ? colors.success : '#7A4CF0'

  const meta = [
    question.question_type,
    question.difficulty_level,
    question.response?.response_duration_seconds != null
      ? formatDuration(question.response.response_duration_seconds)
      : null,
  ]
    .filter(Boolean)
    .join(' • ')

  const insights = feedbackInsights(feedback)

  return (
    <View style={[styles.qCard, { backgroundColor: colors.card }]}>
      <Pressable onPress={() => setExpanded((value) => !value)} style={styles.qTop}>
        <View style={[styles.qNum, { backgroundColor: colors.brandSoft }]}>
          <ThemedText style={[styles.qNumText, { color: colors.subtext }]}>
            {String(question.question_number).padStart(2, '0')}
          </ThemedText>
        </View>
        <View style={{ flex: 1 }}>
          <ThemedText style={[styles.qTitle, { color: colors.oppositeColor }]}>
            &quot;{question.question_text}&quot;
          </ThemedText>
          {meta.length > 0 && (
            <ThemedText style={[styles.qMeta, { color: colors.subtext }]}>{meta}</ThemedText>
          )}
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
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={colors.muted}
            style={{ marginTop: 4 }}
          />
        </View>
      </Pressable>

      {expanded && (
        <View style={styles.qBody}>
          {question.response?.transcribed_text ? (
            <View style={[styles.answerBox, { backgroundColor: colors.inputBg }]}>
              <ThemedText style={[styles.answerLabel, { color: colors.subtext }]}>
                YOUR ANSWER
              </ThemedText>
              <ThemedText style={[styles.answerText, { color: colors.oppositeColor }]}>
                {question.response.transcribed_text}
              </ThemedText>
            </View>
          ) : (
            <ThemedText style={[styles.noAnswer, { color: colors.muted }]}>
              You did not answer this question.
            </ThemedText>
          )}

          {feedback && (
            <View style={styles.scoreBreakdown}>
              {[
                { label: 'Relevance', value: feedback.scores.relevance },
                { label: 'Clarity', value: feedback.scores.clarity },
                { label: 'Confidence', value: feedback.scores.confidence },
                { label: 'Completeness', value: feedback.scores.completeness },
              ]
                .filter((row) => row.value != null)
                .map((row) => (
                  <View key={row.label} style={styles.breakdownRow}>
                    <View style={styles.breakdownLabels}>
                      <ThemedText style={[styles.breakdownLabel, { color: colors.subtext }]}>
                        {row.label}
                      </ThemedText>
                      <ThemedText style={[styles.breakdownValue, { color: colors.oppositeColor }]}>
                        {formatScore(row.value)}
                      </ThemedText>
                    </View>
                    <View style={[styles.breakdownTrack, { backgroundColor: colors.border }]}>
                      <View
                        style={[
                          styles.breakdownFill,
                          {
                            backgroundColor: colors.tint,
                            width: `${scoreToPercent(row.value) * 100}%`,
                          },
                        ]}
                      />
                    </View>
                  </View>
                ))}
            </View>
          )}

          {insights.length > 0 && (
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
          )}

          {question.ideal_answer_guidelines && (
            <View style={[styles.guidelineBox, { borderColor: colors.border }]}>
              <ThemedText style={[styles.answerLabel, { color: colors.subtext }]}>
                WHAT A STRONG ANSWER COVERS
              </ThemedText>
              <ThemedText style={[styles.answerText, { color: colors.subtext }]}>
                {question.ideal_answer_guidelines}
              </ThemedText>
            </View>
          )}
        </View>
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
    gap: 12,
  },
  headerBtn: { width: 28 },
  headerTitle: { fontSize: 16, fontWeight: '700', flex: 1 },
  headerActions: { flexDirection: 'row', gap: 16, alignItems: 'center' },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  errorTitle: { fontWeight: '700', fontSize: 17, textAlign: 'center' },
  errorBody: { fontSize: 14, textAlign: 'center', marginBottom: 8 },
  retryBtn: { paddingHorizontal: 22, paddingVertical: 11, borderRadius: 999 },
  retryBtnText: { color: '#fff', fontWeight: '700' },
  errorBox: { padding: 12, borderRadius: 10, marginBottom: 14 },

  heroTitle: { fontSize: 24, fontWeight: '800', textAlign: 'center', marginTop: 6, marginBottom: 8 },
  heroSub: { fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 20 },

  scoreCard: { borderRadius: 14, padding: 20, alignItems: 'center', marginBottom: 16 },
  scoreTag: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 16 },
  ring: {
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  ringNum: {
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 36,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  goodPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999 },
  goodPillText: { fontWeight: '700', fontSize: 13 },

  metricsCard: { borderRadius: 14, padding: 18, marginBottom: 16 },
  metricsTitle: { fontWeight: '700', fontSize: 16, marginBottom: 16 },
  metricRow: { marginBottom: 14 },
  metricLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  metricLabel: { fontSize: 14, fontWeight: '500' },
  metricValue: { fontWeight: '700', fontSize: 13 },
  metricTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  metricFill: { height: '100%', borderRadius: 3 },

  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    paddingTop: 14,
    marginTop: 4,
  },
  stat: { alignItems: 'center', gap: 2 },
  statValue: { fontWeight: '700', fontSize: 15 },
  statLabel: { fontSize: 11 },

  actionsRow: { flexDirection: 'row', gap: 12, marginTop: 16 },
  btnOutline: {
    flex: 1, borderRadius: 999, paddingVertical: 12, borderWidth: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  btnOutlineText: { fontWeight: '700' },

  card: { borderRadius: 14, padding: 16, marginBottom: 16 },
  cardTitle: { fontWeight: '700', fontSize: 15, marginBottom: 12 },

  skillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  skillChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  skillChipText: { fontSize: 12, fontWeight: '600' },

  notesInput: {
    minHeight: 96,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    fontSize: 14,
    lineHeight: 20,
  },
  notesFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  charCount: { fontSize: 11 },
  notesActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  savedText: { fontSize: 12, fontWeight: '600' },
  saveBtn: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 999,
    minWidth: 104,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  sectionHead: { marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '800' },

  qCard: { borderRadius: 14, padding: 14, marginBottom: 12 },
  qTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  qNum: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  qNumText: { fontWeight: '700', fontSize: 13 },
  qTitle: { fontWeight: '700', fontSize: 14, marginBottom: 4 },
  qMeta: { fontSize: 12, textTransform: 'capitalize' },
  qScore: { fontWeight: '800', fontSize: 14, marginBottom: 4 },
  qBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  qBadgeText: { fontSize: 11, fontWeight: '700' },

  qBody: { marginTop: 14, gap: 14 },
  answerBox: { borderRadius: 10, padding: 12 },
  answerLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 },
  answerText: { fontSize: 13, lineHeight: 20 },
  noAnswer: { fontSize: 13, fontStyle: 'italic' },

  scoreBreakdown: { gap: 10 },
  breakdownRow: { gap: 5 },
  breakdownLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  breakdownLabel: { fontSize: 12 },
  breakdownValue: { fontSize: 12, fontWeight: '700' },
  breakdownTrack: { height: 5, borderRadius: 3, overflow: 'hidden' },
  breakdownFill: { height: '100%', borderRadius: 3 },

  insightWrap: { borderRadius: 10, overflow: 'hidden', flexDirection: 'row' },
  insightAccent: { width: 4 },
  insightInner: { flex: 1, padding: 12 },
  insightHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  insightTag: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  insightSubTag: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginBottom: 3 },
  insightText: { fontSize: 13, lineHeight: 19 },

  guidelineBox: { borderRadius: 10, borderWidth: 1, padding: 12 },

  unlockCard: {
    borderRadius: 14,
    padding: 16,
    marginTop: 8,
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start',
  },
  unlockIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ffffff30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unlockTitle: { color: '#fff', fontWeight: '800', fontSize: 16, marginBottom: 4 },
  unlockSub: { color: '#ffffffd0', fontSize: 13, lineHeight: 18, marginBottom: 12 },
  goPro: { alignSelf: 'flex-start', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999 },
  goProText: { fontWeight: '700' },
})
