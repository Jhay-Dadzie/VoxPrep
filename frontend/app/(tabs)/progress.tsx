import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Animated,
  Easing,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ThemedText } from '@/components/themed-text'
import { ModeBadge } from '@/components/mode-badge'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { useMode } from '@/hooks/mode-context'
import {
  fetchOverview,
  fetchSessionResults,
  type DashboardOverview,
  type RecentSession,
  type SessionResults,
} from '@/services/api'
import { Colors } from '@/constants/theme'

/** Chart plot height. Bars animate to a pixel fraction of this. */
const PLOT_HEIGHT = 130

/**
 * Progress over time, for the active mode only.
 *
 * Shares the dashboard's overview endpoint rather than adding a second one:
 * both screens want the same mode-scoped stats, and one source keeps them from
 * disagreeing. Per-session detail is fetched only when a row is expanded —
 * loading every transcript up front would be wasteful.
 *
 * The chart is drawn with plain Views. A bar per session against a dashed
 * average line shows the trend without a charting dependency.
 */
export default function Progress() {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const { copy, mode, modeId } = useMode()

  const [overview, setOverview] = useState<DashboardOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [openId, setOpenId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Record<string, SessionResults>>({})
  const [detailLoading, setDetailLoading] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setOverview(await fetchOverview(modeId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your progress.')
    } finally {
      setLoading(false)
    }
  }, [modeId])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load]),
  )

  // Switching mode must drop the previous mode's numbers and any expanded
  // detail, rather than showing viva transcripts under an Oral Exam heading.
  useEffect(() => {
    setOverview(null)
    setLoading(true)
    setOpenId(null)
    setDetail({})
  }, [modeId])

  /** Expand a row, fetching its transcripts and feedback the first time. */
  const toggle = async (session: RecentSession) => {
    if (openId === session.id) {
      setOpenId(null)
      return
    }
    setOpenId(session.id)

    if (detail[session.id]) return

    setDetailLoading(session.id)
    try {
      const results = await fetchSessionResults(session.id)
      setDetail((cur) => ({ ...cur, [session.id]: results }))
    } catch {
      // Leaves the row expanded with a "could not load" note below.
    } finally {
      setDetailLoading(null)
    }
  }

  const scores = (overview?.history ?? []).map((h) => h.score ?? 0)
  const average = overview?.averageScore ?? null
  const hasHistory = scores.length >= 2

  if (!loading && overview && overview.totalSessions === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.card }} edges={['top']}>
        <Header colors={colors} />
        <View style={[styles.empty, { backgroundColor: colors.background }]}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.brandSoft }]}>
            <Ionicons name={mode.icon as any} size={30} color={colors.tint} />
          </View>
          <ThemedText style={[styles.emptyTitle, { color: colors.oppositeColor }]}>
            No {mode.label} history yet
          </ThemedText>
          <ThemedText style={[styles.emptyBody, { color: colors.subtext }]}>
            Your scores over time will appear here once you have finished a few{' '}
            {copy.sessionNounPlural}.
          </ThemedText>
          <Pressable
            style={[styles.emptyCta, { backgroundColor: colors.tint }]}
            onPress={() => router.push('/(tabs)/practice')}
          >
            <ThemedText style={{ color: '#fff', fontWeight: '700' }}>{copy.practiceCta}</ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.card }} edges={['top']}>
      <Header colors={colors} />

      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.tint} />}
      >
        {error && (
          <View style={[styles.errorBox, { backgroundColor: colors.dangerBg }]}>
            <Ionicons name="alert-circle" size={15} color={colors.danger} />
            <ThemedText style={{ color: colors.danger, fontSize: 12, flex: 1 }}>{error}</ThemedText>
          </View>
        )}

        <View style={styles.scopeRow}>
          <Ionicons name={mode.icon as any} size={13} color={colors.muted} />
          <ThemedText style={{ color: colors.muted, fontSize: 11, fontWeight: '600', letterSpacing: 0.4 }}>
            {mode.label.toUpperCase()}
          </ThemedText>
        </View>

        {/* The headline number deserves weight — a flat row of three equal
            tiles gave the average no more prominence than the session count. */}
        <LinearGradient
          colors={[colors.tint, '#7A4CF0']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroTop}>
            <View>
              <ThemedText style={styles.heroLabel}>AVERAGE SCORE</ThemedText>
              <View style={styles.heroValueRow}>
                <ThemedText style={styles.heroValue}>
                  {average != null ? Math.round(average) : '—'}
                </ThemedText>
                {average != null && <ThemedText style={styles.heroPercent}>%</ThemedText>}
              </View>
            </View>

            {hasHistory && (
              <View style={styles.heroDelta}>
                <Ionicons
                  name={scores[scores.length - 1] >= scores[0] ? 'trending-up' : 'trending-down'}
                  size={16}
                  color="#fff"
                />
                <ThemedText style={styles.heroDeltaText}>
                  {scores[scores.length - 1] >= scores[0] ? '+' : ''}
                  {Math.round(scores[scores.length - 1] - scores[0])} pts
                </ThemedText>
              </View>
            )}
          </View>

          <View style={styles.heroFooter}>
            <HeroStat
              icon="checkmark-done"
              value={String(overview?.completedSessions ?? 0)}
              label={copy.sessionsCompletedLabel}
            />
            <View style={styles.heroDivider} />
            <HeroStat
              icon="trophy"
              value={overview?.bestScore != null ? `${Math.round(overview.bestScore)}%` : '—'}
              label="Personal best"
            />
          </View>

          <Ionicons name={mode.icon as any} size={110} color="#ffffff14" style={styles.heroGlyph} />
        </LinearGradient>

        {hasHistory ? (
          <View style={[styles.chartCard, { backgroundColor: colors.card }]}>
            <View style={styles.chartHead}>
              <View style={{ flex: 1 }}>
                <ThemedText style={[styles.chartTitle, { color: colors.oppositeColor }]}>
                  Score over time
                </ThemedText>
                <ThemedText style={[styles.chartSub, { color: colors.subtext }]}>
                  Last {scores.length} scored {copy.sessionNounPlural}
                </ThemedText>
              </View>
              <TrendPill first={scores[0]} latest={scores[scores.length - 1]} colors={colors} />
            </View>
            <ScoreChart scores={scores} average={average} colors={colors} />
          </View>
        ) : (
          <View style={[styles.chartCard, { backgroundColor: colors.card }]}>
            <ThemedText style={{ color: colors.subtext, fontSize: 13, textAlign: 'center' }}>
              {scores.length === 1
                ? 'One scored session so far. Finish another to see a trend.'
                : 'No scored sessions yet — a trend appears once answers have been graded.'}
            </ThemedText>
          </View>
        )}

        <ThemedText style={[styles.sectionTitle, { color: colors.oppositeColor }]}>
          {copy.recentSessionsLabel}
        </ThemedText>
        <ThemedText style={[styles.sectionCaption, { color: colors.subtext }]}>
          Tap a session to read what you said and how it was scored.
        </ThemedText>

        {overview?.recent.map((session) => (
          <SessionRow
            key={session.id}
            session={session}
            open={openId === session.id}
            loading={detailLoading === session.id}
            detail={detail[session.id] ?? null}
            onPress={() => toggle(session)}
            colors={colors}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  )
}

function Header({ colors }: { colors: any }) {
  return (
    <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
      <ThemedText style={[styles.headerTitle, { color: colors.tint }]}>Progress</ThemedText>
      <View style={{ flex: 1 }} />
      <ModeBadge />
    </View>
  )
}

/** Secondary figure inside the gradient hero. */
function HeroStat({ icon, value, label }: { icon: any; value: string; label: string }) {
  return (
    <View style={styles.heroStat}>
      <Ionicons name={icon} size={14} color="#ffffffcc" />
      <View>
        <ThemedText style={styles.heroStatValue}>{value}</ThemedText>
        <ThemedText style={styles.heroStatLabel} numberOfLines={1}>
          {label}
        </ThemedText>
      </View>
    </View>
  )
}

function TrendPill({ first, latest, colors }: { first: number; latest: number; colors: any }) {
  const delta = Math.round(latest - first)
  const up = delta >= 0
  return (
    <View style={[styles.deltaPill, { backgroundColor: up ? colors.successBg : colors.dangerBg }]}>
      <Ionicons name={up ? 'trending-up' : 'trending-down'} size={13} color={up ? colors.success : colors.danger} />
      <ThemedText style={[styles.deltaText, { color: up ? colors.success : colors.danger }]}>
        {up ? '+' : ''}{delta} pts
      </ThemedText>
    </View>
  )
}

/** Bar per session, with the average drawn across as a dashed line. */
function ScoreChart({ scores, average, colors }: { scores: number[]; average: number | null; colors: any }) {
  const latest = scores.length - 1
  return (
    <View>
      <View style={styles.plot}>
        {/* Quiet reference lines: without them the bars float and the chart
            reads as decoration rather than data. */}
        {[25, 50, 75].map((y) => (
          <View key={y} style={[styles.gridLine, { bottom: `${y}%`, backgroundColor: colors.border }]} />
        ))}

        {average != null && (
          <View style={[styles.averageLine, { bottom: `${average}%`, borderColor: colors.muted }]} />
        )}

        {scores.map((score, i) => (
          <Bar
            key={i}
            score={score}
            index={i}
            isLatest={i === latest}
            colors={colors}
          />
        ))}
      </View>

      <View style={styles.axisRow}>
        <ThemedText style={[styles.axisText, { color: colors.muted }]}>Oldest</ThemedText>
        {average != null && (
          <View style={styles.axisAvg}>
            <View style={[styles.axisDash, { borderColor: colors.muted }]} />
            <ThemedText style={[styles.axisText, { color: colors.muted }]}>
              avg {Math.round(average)}%
            </ThemedText>
          </View>
        )}
        <ThemedText style={[styles.axisText, { color: colors.muted }]}>Latest</ThemedText>
      </View>
    </View>
  )
}

/**
 * One bar, growing from the baseline on mount.
 *
 * Staggered by index so the chart reads left to right as it appears, which
 * matches how the data is meant to be read. Uses the native driver, so the
 * animation runs off the JS thread and stays smooth while results load.
 */
function Bar({
  score, index, isLatest, colors,
}: { score: number; index: number; isLatest: boolean; colors: any }) {
  const grow = useRef(new Animated.Value(0)).current

  // Pixels rather than a percentage: height is animated directly, because
  // scaleY would grow the bar outward from its centre instead of up from the
  // axis, and there is no transform-origin in React Native.
  const target = (Math.max(2, Math.min(100, score)) / 100) * PLOT_HEIGHT

  useEffect(() => {
    Animated.timing(grow, {
      toValue: target,
      duration: 520,
      delay: index * 45,
      easing: Easing.out(Easing.cubic),
      // Height is a layout property, so this cannot run on the native thread.
      // Fine here: a handful of bars animating once on mount.
      useNativeDriver: false,
    }).start()
  }, [grow, index, target])

  return (
    <View style={styles.barSlot}>
      {isLatest && (
        <ThemedText style={[styles.barValue, { color: colors.tint }]}>
          {Math.round(score)}
        </ThemedText>
      )}
      <Animated.View style={[styles.barWrap, { height: grow }]}>
        <LinearGradient
          colors={isLatest ? [colors.tint, '#7A4CF0'] : [colors.brandSoft, colors.brandSoft]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.bar}
        />
      </Animated.View>
    </View>
  )
}

function SessionRow({
  session, open, loading, detail, onPress, colors,
}: {
  session: RecentSession
  open: boolean
  loading: boolean
  detail: SessionResults | null
  onPress: () => void
  colors: any
}) {
  const score = session.score
  const tone =
    score == null ? colors.muted : score >= 75 ? colors.success : score >= 50 ? colors.warning : colors.danger
  const toneBg =
    score == null ? colors.brandSoft : score >= 75 ? colors.successBg : score >= 50 ? colors.warningBg : colors.dangerBg

  const answered = detail?.questions.filter((q) => q.answered) ?? []

  return (
    <View style={[styles.sessionCard, { backgroundColor: colors.card }]}>
      {/* A colour rail makes the score scannable down the list without
          reading every pill. */}
      <View style={[styles.sessionRail, { backgroundColor: tone }]} />

      {/* Column beside the rail: the header and any expanded detail stack
          vertically while the rail runs the full height. */}
      <View style={styles.sessionBody}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.sessionHead}
      >
        <View style={{ flex: 1 }}>
          <ThemedText style={[styles.sessionTitle, { color: colors.oppositeColor }]} numberOfLines={1}>
            {session.title}
          </ThemedText>
          <View style={styles.sessionMetaRow}>
            <Ionicons
              name={session.status === 'completed' ? 'checkmark-circle' : 'time-outline'}
              size={12}
              color={colors.muted}
            />
            <ThemedText style={[styles.sessionMeta, { color: colors.subtext }]}>
              {session.questionsAnswered}/{session.totalQuestions} answered
            </ThemedText>
          </View>
        </View>
        <View style={[styles.scorePill, { backgroundColor: toneBg }]}>
          <ThemedText style={[styles.scorePillText, { color: tone }]}>
            {score == null ? '—' : `${Math.round(score)}%`}
          </ThemedText>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
      </Pressable>

      {open && (
        <View style={[styles.detail, { borderTopColor: colors.border }]}>
          {loading && <ActivityIndicator color={colors.tint} style={{ marginVertical: 12 }} />}

          {!loading && answered.length === 0 && (
            <ThemedText style={{ color: colors.subtext, fontSize: 12, paddingVertical: 8 }}>
              No answers were recorded in this session.
            </ThemedText>
          )}

          {answered.map((q) => (
            <AnswerBlock key={q.questionId} q={q} colors={colors} />
          ))}
        </View>
      )}
      </View>
    </View>
  )
}

/** One answered question: what was asked, what you said, how it scored. */
function AnswerBlock({ q, colors }: { q: SessionResults['questions'][number]; colors: any }) {
  const score = q.scores?.overall ?? null
  const accent =
    score == null ? colors.muted : score >= 75 ? colors.success : score >= 50 ? colors.warning : colors.danger

  return (
    <View style={[styles.answer, { backgroundColor: colors.inputBg }]}>
      <View style={[styles.answerAccent, { backgroundColor: accent }]} />
      <View style={styles.answerInner}>
        <View style={styles.answerHead}>
          <ThemedText style={[styles.answerQ, { color: colors.oppositeColor }]} numberOfLines={2}>
            {q.questionNumber}. {q.questionText}
          </ThemedText>
          <ThemedText style={[styles.answerScore, { color: accent }]}>
            {score == null ? '—' : `${Math.round(score)}%`}
          </ThemedText>
        </View>

        {q.transcript && (
          <ThemedText style={[styles.answerTranscript, { color: colors.subtext }]} numberOfLines={4}>
            &quot;{q.transcript}&quot;
          </ThemedText>
        )}

        {q.improvements && (
          <>
            <View style={styles.answerFeedbackHead}>
              <Ionicons name="sparkles" size={12} color={accent} />
              <ThemedText style={[styles.answerFeedbackTag, { color: accent }]}>FEEDBACK</ThemedText>
            </View>
            <ThemedText style={[styles.answerFeedback, { color: colors.subtext }]}>
              {q.improvements}
            </ThemedText>
          </>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
  headerTitle: { fontSize: 16, fontWeight: '700' },

  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, padding: 12, marginBottom: 14 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  emptyTitle: { fontSize: 18, fontWeight: '800' },
  emptyBody: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 6, marginBottom: 22 },
  emptyCta: { borderRadius: 999, paddingHorizontal: 28, paddingVertical: 14 },

  hero: { borderRadius: 20, padding: 20, marginBottom: 18, overflow: 'hidden' },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  heroLabel: { color: '#ffffffb0', fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  heroValueRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 2 },
  heroValue: { color: '#fff', fontSize: 46, fontWeight: '800', letterSpacing: -1.5, lineHeight: 52 },
  heroPercent: { color: '#ffffffcc', fontSize: 20, fontWeight: '700', marginLeft: 2 },
  heroDelta: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#ffffff26', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
  },
  heroDeltaText: { color: '#fff', fontSize: 12, fontWeight: '800' },

  heroFooter: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 18, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: '#ffffff26',
  },
  heroDivider: { width: 1, height: 26, backgroundColor: '#ffffff26', marginHorizontal: 16 },
  heroStat: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  heroStatValue: { color: '#fff', fontSize: 15, fontWeight: '800' },
  heroStatLabel: { color: '#ffffffa0', fontSize: 10, marginTop: 1 },
  heroGlyph: { position: 'absolute', right: -18, bottom: -22 },

  scopeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },

  chartCard: { borderRadius: 14, padding: 18, marginBottom: 20 },
  chartHead: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 18 },
  chartTitle: { fontSize: 16, fontWeight: '700' },
  chartSub: { fontSize: 12, marginTop: 2 },
  deltaPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  deltaText: { fontSize: 12, fontWeight: '700' },

  plot: { height: PLOT_HEIGHT, flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  gridLine: { position: 'absolute', left: 0, right: 0, height: 1, opacity: 0.5 },
  averageLine: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1, borderStyle: 'dashed' },
  barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  // transformOrigin is not supported, so the wrapper is bottom-anchored and
  // scaleY grows it upward from the baseline.
  barWrap: { width: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', height: '100%', borderTopLeftRadius: 5, borderTopRightRadius: 5, minHeight: 3 },
  barValue: { fontSize: 10, fontWeight: '800', marginBottom: 3 },

  axisRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  axisText: { fontSize: 11 },
  axisAvg: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  axisDash: { width: 14, borderTopWidth: 1, borderStyle: 'dashed' },

  sectionTitle: { fontSize: 18, fontWeight: '800' },
  sectionCaption: { fontSize: 13, marginTop: 4, marginBottom: 12 },

  sessionCard: { borderRadius: 14, marginBottom: 10, overflow: 'hidden', flexDirection: 'row' },
  sessionRail: { width: 3 },
  sessionBody: { flex: 1 },
  sessionHead: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  sessionTitle: { fontSize: 14, fontWeight: '700' },
  sessionMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  sessionMeta: { fontSize: 12 },
  scorePill: { minWidth: 46, alignItems: 'center', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8 },
  scorePillText: { fontSize: 13, fontWeight: '800' },

  detail: { borderTopWidth: 1, padding: 14, paddingTop: 12 },

  answer: { borderRadius: 10, overflow: 'hidden', flexDirection: 'row', marginBottom: 10 },
  answerAccent: { width: 4 },
  answerInner: { flex: 1, padding: 12 },
  answerHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  answerQ: { flex: 1, fontSize: 13, fontWeight: '700', lineHeight: 18 },
  answerScore: { fontSize: 13, fontWeight: '800' },
  answerTranscript: { fontSize: 13, lineHeight: 19, fontStyle: 'italic', marginBottom: 10 },
  answerFeedbackHead: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  answerFeedbackTag: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  answerFeedback: { fontSize: 12, lineHeight: 18 },
})
