import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ThemedText } from '@/components/themed-text'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { MODES } from '@/constants/modes'
import { Colors } from '@/constants/theme'
import { examService } from '@/services/exam'
import { toAuthError } from '@/services/error-handler'
import { examGrade, formatDuration } from '@/lib/format'
import { toneBg, toneColor } from '@/lib/feedback-view'
import type { ExamResult, MarkedQuestion } from '@/types/exam'

type Colours = typeof Colors.light

/**
 * A marked exam paper.
 *
 * Not the interview results screen with different words on it. An interview is
 * judged — four scores and a paragraph of critique per answer. A paper is
 * marked: every question is right or wrong, the total is a percentage of the
 * whole paper, and what the student needs from this screen is which ones they
 * lost and why the right answer was right.
 *
 * So there is no "relevance", no "clarity", no AI insight card, and no regrade
 * button — marking is arithmetic and cannot half-fail. There is a filter,
 * because on a thirty-question paper the six wrong ones are the whole point and
 * scrolling past twenty-four correct answers to find them is not.
 */

type Filter = 'all' | 'wrong' | 'blank'

export default function ExamResults() {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  // A marked paper is a paper whatever the practice filter says now, so the
  // wording comes from the exam mode rather than from the active one.
  const { copy, examCopy } = MODES.exam
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>()

  const [result, setResult] = useState<ExamResult | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRetaking, setIsRetaking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')

  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const load = useCallback(async () => {
    if (!sessionId) return

    setIsLoading(true)
    setError(null)

    try {
      const marked = await examService.result(sessionId)
      if (isMountedRef.current) setResult(marked)
    } catch (err) {
      if (isMountedRef.current) setError(toAuthError(err).message)
    } finally {
      if (isMountedRef.current) setIsLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    load()
  }, [load])

  const totals = result?.totals
  const grade = examGrade(totals?.score ?? null)

  const shown = useMemo(() => {
    const questions = result?.questions ?? []
    if (filter === 'wrong') {
      return questions.filter((question) => !question.isCorrect && question.selectedOption)
    }
    if (filter === 'blank') return questions.filter((question) => !question.selectedOption)
    return questions
  }, [result, filter])

  /** A retake is a new paper on the same material, so it opens a new session. */
  const retake = async () => {
    if (!sessionId || isRetaking) return

    setIsRetaking(true)
    setError(null)

    try {
      const prepared = await examService.retake(sessionId)
      if (!isMountedRef.current) return
      router.replace({ pathname: '/exam-session', params: { sessionId: prepared.session.id } })
    } catch (err) {
      if (isMountedRef.current) {
        setError(toAuthError(err).message)
        setIsRetaking(false)
      }
    }
  }

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.tint} />
        <ThemedText style={{ color: colors.subtext, marginTop: 12 }}>Marking your paper...</ThemedText>
      </SafeAreaView>
    )
  }

  if (!result) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.background }]}>
        <Ionicons name="alert-circle-outline" size={34} color={colors.danger} />
        <ThemedText style={{ color: colors.subtext, textAlign: 'center', marginVertical: 12 }}>
          {error || 'No marked exam was found for this session.'}
        </ThemedText>
        <Pressable style={[styles.pillBtn, { backgroundColor: colors.tint }]} onPress={load}>
          <ThemedText style={{ color: '#fff', fontWeight: '700' }}>Try Again</ThemedText>
        </Pressable>
        <Pressable
          style={[styles.pillBtn, { borderWidth: 1, borderColor: colors.border }]}
          onPress={() => router.replace('/(tabs)/dashboard')}
        >
          <ThemedText style={{ color: colors.oppositeColor, fontWeight: '700' }}>
            Back to Dashboard
          </ThemedText>
        </Pressable>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.replace('/(tabs)/dashboard')} hitSlop={10}>
          <Ionicons name="close" size={22} color={colors.subtext} />
        </Pressable>
        <ThemedText style={[styles.headerTitle, { color: colors.tint }]}>
          {copy.resultsTitle}
        </ThemedText>
        <Pressable onPress={() => router.push('/history')} hitSlop={10}>
          <Ionicons name="time-outline" size={20} color={colors.tint} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {error ? (
          <View style={[styles.errorBox, { backgroundColor: colors.dangerBg }]}>
            <ThemedText style={{ color: colors.danger, fontSize: 13 }}>{error}</ThemedText>
          </View>
        ) : null}

        <ThemedText style={[styles.heroTitle, { color: colors.oppositeColor }]}>
          {copy.resultsHeroTitle}
        </ThemedText>
        <ThemedText style={[styles.heroSub, { color: colors.subtext }]}>
          {result.session.subject || result.session.title || 'Your exam has been marked.'}
        </ThemedText>

        {/* The mark, stated the way an exam states it: a percentage, the raw
            fraction it came from, and a grade. No performance metrics. */}
        <View style={[styles.scoreCard, { backgroundColor: colors.card }]}>
          <View style={[styles.ring, { borderColor: toneColor(grade.tone, colors) }]}>
            <ThemedText style={[styles.ringNum, { color: toneColor(grade.tone, colors) }]}>
              {totals?.score ?? 0}%
            </ThemedText>
            <ThemedText style={[styles.ringSub, { color: colors.subtext }]}>
              {totals?.correct ?? 0} of {totals?.total ?? 0}
            </ThemedText>
          </View>

          <View style={[styles.gradePill, { backgroundColor: toneBg(grade.tone, colors) }]}>
            <ThemedText style={[styles.gradePillText, { color: toneColor(grade.tone, colors) }]}>
              Grade {grade.letter} · {grade.label}
            </ThemedText>
          </View>

          <View style={[styles.tallyRow, { borderTopColor: colors.divider }]}>
            <Tally label="Correct" value={totals?.correct ?? 0} color={colors.success} colors={colors} />
            <Tally label="Wrong" value={totals?.incorrect ?? 0} color={colors.danger} colors={colors} />
            <Tally label="Blank" value={totals?.unanswered ?? 0} color={colors.warning} colors={colors} />
            <Tally
              label="Time"
              value={formatDuration(result.session.durationSeconds)}
              color={colors.oppositeColor}
              colors={colors}
            />
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable
            style={[styles.btnOutline, { borderColor: colors.tint, opacity: isRetaking ? 0.6 : 1 }]}
            onPress={retake}
            disabled={isRetaking}
          >
            {isRetaking ? <ActivityIndicator size="small" color={colors.tint} /> : null}
            <ThemedText style={[styles.btnText, { color: colors.tint }]}>
              {isRetaking ? 'Setting a new paper...' : copy.retakeCta}
            </ThemedText>
          </Pressable>
          <Pressable
            style={[styles.btnPrimary, { backgroundColor: colors.tint }]}
            onPress={() => router.replace('/(tabs)/dashboard')}
          >
            <ThemedText style={[styles.btnText, { color: '#fff' }]}>Done</ThemedText>
          </Pressable>
        </View>

        <ThemedText style={[styles.sectionTitle, { color: colors.oppositeColor }]}>
          Question Review
        </ThemedText>
        <ThemedText style={[styles.sectionSub, { color: colors.subtext }]}>
          {examCopy!.resultsSubtitle ??
            'Every question is below with the right answer and why it is right.'}
        </ThemedText>

        <View style={styles.filters}>
          <FilterChip
            label={`All ${totals?.total ?? 0}`}
            active={filter === 'all'}
            onPress={() => setFilter('all')}
            colors={colors}
          />
          <FilterChip
            label={`Wrong ${totals?.incorrect ?? 0}`}
            active={filter === 'wrong'}
            onPress={() => setFilter('wrong')}
            colors={colors}
            tone={colors.danger}
          />
          <FilterChip
            label={`Blank ${totals?.unanswered ?? 0}`}
            active={filter === 'blank'}
            onPress={() => setFilter('blank')}
            colors={colors}
            tone={colors.warning}
          />
        </View>

        {shown.length === 0 ? (
          <View style={[styles.emptyFilter, { backgroundColor: colors.card }]}>
            <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            <ThemedText style={{ color: colors.subtext, fontSize: 13, flex: 1 }}>
              {filter === 'wrong'
                ? 'Nothing wrong on this paper.'
                : filter === 'blank'
                  ? 'You answered every question.'
                  : 'This paper has no questions on it.'}
            </ThemedText>
          </View>
        ) : (
          shown.map((question) => (
            <MarkedCard key={question.id} question={question} colors={colors} />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

/**
 * One marked question.
 *
 * The rule this card follows: the student must be able to see, without reading,
 * whether they got it. So the header carries the verdict, the option they chose
 * is marked wrong in red where it sits, the correct one is marked in green, and
 * the explanation sits underneath as the reason rather than as a consolation.
 */
function MarkedCard({ question, colors }: { question: MarkedQuestion; colors: Colours }) {
  const answered = Boolean(question.selectedOption)
  const tone = question.isCorrect ? colors.success : answered ? colors.danger : colors.warning
  const toneSoft = question.isCorrect
    ? colors.successBg
    : answered
      ? colors.dangerBg
      : colors.warningBg

  const verdict = question.isCorrect ? 'Correct' : answered ? 'Incorrect' : 'Not answered'
  const icon = question.isCorrect ? 'checkmark-circle' : answered ? 'close-circle' : 'help-circle'

  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      <View style={styles.cardHead}>
        <View style={[styles.cardNum, { backgroundColor: toneSoft }]}>
          <ThemedText style={[styles.cardNumText, { color: tone }]}>
            {String(question.questionNumber).padStart(2, '0')}
          </ThemedText>
        </View>
        <View style={{ flex: 1 }}>
          <ThemedText style={[styles.cardQuestion, { color: colors.oppositeColor }]}>
            {question.questionText}
          </ThemedText>
          {question.topic ? (
            <ThemedText style={[styles.cardTopic, { color: colors.muted }]}>{question.topic}</ThemedText>
          ) : null}
        </View>
      </View>

      <View style={[styles.verdict, { backgroundColor: toneSoft }]}>
        <Ionicons name={icon as any} size={14} color={tone} />
        <ThemedText style={[styles.verdictText, { color: tone }]}>{verdict}</ThemedText>
      </View>

      {question.options.map((option) => {
        const isCorrect = option.label === question.correctOption
        const isChosen = option.label === question.selectedOption
        const wrongChoice = isChosen && !isCorrect

        const border = isCorrect ? colors.success : wrongChoice ? colors.danger : colors.border
        const background = isCorrect
          ? colors.successBg
          : wrongChoice
            ? colors.dangerBg
            : 'transparent'

        return (
          <View
            key={option.label}
            style={[styles.option, { borderColor: border, backgroundColor: background }]}
          >
            <ThemedText
              style={[
                styles.optionLabel,
                { color: isCorrect ? colors.success : wrongChoice ? colors.danger : colors.subtext },
              ]}
            >
              {option.label}
            </ThemedText>
            <ThemedText style={[styles.optionText, { color: colors.oppositeColor }]}>
              {option.text}
            </ThemedText>
            {isCorrect ? (
              <Ionicons name="checkmark" size={16} color={colors.success} />
            ) : wrongChoice ? (
              <Ionicons name="close" size={16} color={colors.danger} />
            ) : null}
          </View>
        )
      })}

      {/* Shown on every question, right or wrong. A student who guessed
          correctly needs the reason as much as one who guessed wrongly. */}
      {question.explanation ? (
        <View style={[styles.explain, { backgroundColor: colors.inputBg }]}>
          <View style={[styles.explainAccent, { backgroundColor: colors.tint }]} />
          <View style={{ flex: 1, padding: 12 }}>
            <ThemedText style={[styles.explainTag, { color: colors.tint }]}>
              WHY {question.correctOption} IS CORRECT
            </ThemedText>
            <ThemedText style={[styles.explainText, { color: colors.oppositeColor }]}>
              {question.explanation}
            </ThemedText>
          </View>
        </View>
      ) : null}
    </View>
  )
}

function Tally({
  label,
  value,
  color,
  colors,
}: {
  label: string
  value: number | string
  color: string
  colors: Colours
}) {
  return (
    <View style={styles.tally}>
      <ThemedText style={[styles.tallyValue, { color }]}>{value}</ThemedText>
      <ThemedText style={[styles.tallyLabel, { color: colors.subtext }]}>{label}</ThemedText>
    </View>
  )
}

function FilterChip({
  label,
  active,
  onPress,
  colors,
  tone,
}: {
  label: string
  active: boolean
  onPress: () => void
  colors: Colours
  tone?: string
}) {
  const accent = tone ?? colors.tint

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.filterChip,
        {
          backgroundColor: active ? accent : colors.card,
          borderColor: active ? accent : colors.border,
        },
      ]}
    >
      <ThemedText
        style={[styles.filterChipText, { color: active ? '#fff' : colors.oppositeColor }]}
      >
        {label}
      </ThemedText>
    </Pressable>
  )
}

const RING = 150

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  pillBtn: { paddingHorizontal: 22, paddingVertical: 11, borderRadius: 999 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 16, fontWeight: '700' },

  errorBox: { padding: 12, borderRadius: 10, marginBottom: 14 },

  heroTitle: { fontSize: 26, fontWeight: '800', textAlign: 'center', marginTop: 6, marginBottom: 8 },
  heroSub: { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 20, paddingHorizontal: 20 },

  scoreCard: { borderRadius: 14, padding: 20, alignItems: 'center', marginBottom: 16 },
  ring: {
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  ringNum: { fontSize: 34, fontWeight: '800', lineHeight: 40, includeFontPadding: false },
  ringSub: { fontSize: 13, marginTop: 2 },
  gradePill: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 999 },
  gradePillText: { fontWeight: '700', fontSize: 13 },

  tallyRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignSelf: 'stretch',
    borderTopWidth: 1,
    paddingTop: 16,
    marginTop: 18,
  },
  tally: { alignItems: 'center', gap: 3 },
  tallyValue: { fontSize: 18, fontWeight: '800' },
  tallyLabel: { fontSize: 11 },

  actions: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  btnPrimary: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOutline: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnText: { fontWeight: '700', fontSize: 14 },

  sectionTitle: { fontSize: 19, fontWeight: '800', marginBottom: 6 },
  sectionSub: { fontSize: 13, lineHeight: 19, marginBottom: 14 },

  filters: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  filterChipText: { fontSize: 12, fontWeight: '700' },

  emptyFilter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    padding: 16,
  },

  card: { borderRadius: 14, padding: 14, marginBottom: 12 },
  cardHead: { flexDirection: 'row', gap: 12, marginBottom: 10 },
  cardNum: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  cardNumText: { fontWeight: '800', fontSize: 13 },
  cardQuestion: { fontSize: 14, fontWeight: '700', lineHeight: 20 },
  cardTopic: { fontSize: 11, marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.4 },

  verdict: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    marginBottom: 12,
  },
  verdictText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },

  option: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 7,
  },
  optionLabel: { fontWeight: '800', fontSize: 13, width: 16 },
  optionText: { flex: 1, fontSize: 13, lineHeight: 19 },

  explain: { flexDirection: 'row', borderRadius: 10, overflow: 'hidden', marginTop: 6 },
  explainAccent: { width: 4 },
  explainTag: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, marginBottom: 5 },
  explainText: { fontSize: 13, lineHeight: 19 },
})
