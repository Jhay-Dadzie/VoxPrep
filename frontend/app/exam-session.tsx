import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ThemedText } from '@/components/themed-text'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { MODES } from '@/constants/modes'
import { Colors } from '@/constants/theme'
import { examService } from '@/services/exam'
import { toAuthError } from '@/services/error-handler'
import { forgetActiveExam, rememberActiveExam } from '@/lib/active-exam'
import type { Exam, ExamQuestion } from '@/types/exam'

type Colours = typeof Colors.light

/**
 * Sitting a written exam.
 *
 * One question on screen at a time, moved through with Previous and Next. That
 * is the whole interaction, and everything else here exists to protect it:
 *
 *  - **Nothing is marked until the student says so.** No option turns green on
 *    tap, no running score is shown, and the correct answer is not even in the
 *    payload the screen holds. Marking happens once, on Complete Exam.
 *
 *  - **Selections are server-side.** Each tap is a small PUT. The screen shows
 *    the choice immediately and does not wait for the write, but the write is
 *    what makes closing the app on question 19 cost nothing.
 *
 *  - **Review before submit.** Past the last question the paper does not
 *    submit itself: it opens a review of all thirty, blanks called out, each one
 *    a tap away from being changed. Submitting is a deliberate act.
 */

type Stage = 'sitting' | 'review'

export default function ExamSession() {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  // The exam mode's own wording, not the mode filter's. A paper resumed after
  // the user has switched the practice filter to Job Interview is still a paper,
  // and must not start calling itself an interview half-way through.
  const { copy, examCopy } = MODES.exam
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>()

  const [exam, setExam] = useState<Exam | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [index, setIndex] = useState(0)
  const [stage, setStage] = useState<Stage>('sitting')

  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** A tap whose write did not land. The answer still counts locally. */
  const [unsaved, setUnsaved] = useState(false)

  const isMountedRef = useRef(true)
  const scrollRef = useRef<ScrollView>(null)

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
      const loaded = await examService.get(sessionId)
      if (!isMountedRef.current) return

      // Already marked — there is nothing to sit, only marks to read.
      if (loaded.submitted) {
        forgetActiveExam(sessionId)
        router.replace({ pathname: '/exam-results', params: { sessionId } })
        return
      }

      // An unfinished paper is invisible to history, so this pointer is the
      // only way back to it from the practice screen.
      rememberActiveExam(sessionId)
      setExam(loaded)
      setAnswers(
        Object.fromEntries(
          loaded.questions
            .filter((question) => question.selectedOption)
            .map((question) => [question.id, question.selectedOption!])
        )
      )
      // Resuming lands on the first unanswered question rather than back at
      // one — that is where the student stopped.
      const resumeAt = loaded.questions.findIndex((question) => !question.selectedOption)
      setIndex(resumeAt === -1 ? 0 : resumeAt)
    } catch (err) {
      if (isMountedRef.current) setError(toAuthError(err).message)
    } finally {
      if (isMountedRef.current) setIsLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    load()
  }, [load])

  const questions = useMemo(() => exam?.questions ?? [], [exam])
  const question: ExamQuestion | undefined = questions[index]
  const answeredCount = useMemo(
    () => questions.filter((item) => answers[item.id]).length,
    [questions, answers]
  )
  const blanks = questions.length - answeredCount

  const goTo = (next: number) => {
    setIndex(Math.max(0, Math.min(questions.length - 1, next)))
    scrollRef.current?.scrollTo({ y: 0, animated: false })
  }

  /**
   * Record a choice.
   *
   * Local state first so the tap is instant, then the write. A failed write is
   * flagged rather than rolled back: the student made a choice, and taking it
   * back off the screen because of a flaky connection would be the worse lie.
   */
  const choose = async (option: string) => {
    if (!question || !sessionId || isSubmitting) return

    setAnswers((current) => ({ ...current, [question.id]: option }))

    try {
      await examService.answer(sessionId, question.id, option)
      if (isMountedRef.current) setUnsaved(false)
    } catch {
      if (isMountedRef.current) setUnsaved(true)
    }
  }

  const submit = async () => {
    if (!sessionId || isSubmitting) return

    setIsSubmitting(true)
    setError(null)

    try {
      await examService.submit(sessionId)
      await forgetActiveExam(sessionId)
      if (!isMountedRef.current) return
      router.replace({ pathname: '/exam-results', params: { sessionId } })
    } catch (err) {
      if (isMountedRef.current) {
        setError(toAuthError(err).message)
        setIsSubmitting(false)
      }
    }
  }

  /** Submitting is final, so blanks are named before they cost marks. */
  const confirmSubmit = () => {
    if (blanks === 0) {
      submit()
      return
    }

    Alert.alert(
      `${blanks} question${blanks === 1 ? '' : 's'} left blank`,
      `Blank answers score nothing. Submit anyway, or go back and finish ${
        blanks === 1 ? 'it' : 'them'
      }?`,
      [
        { text: 'Go back', style: 'cancel' },
        { text: 'Submit anyway', style: 'destructive', onPress: submit },
      ]
    )
  }

  const leave = () => {
    Alert.alert(
      'Leave this exam?',
      'Your answers are saved. You can pick the paper up where you left it from the Practice tab.',
      [
        { text: 'Stay', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: () => router.replace('/(tabs)/practice') },
      ]
    )
  }

  if (!sessionId) {
    return (
      <Message
        colors={colors}
        text="This exam is missing an id. Start a new one from Practice."
        onBack={() => router.replace('/(tabs)/practice')}
      />
    )
  }

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.tint} />
        <ThemedText style={{ color: colors.subtext, marginTop: 12 }}>Opening your paper...</ThemedText>
      </SafeAreaView>
    )
  }

  if (error && !exam) {
    return (
      <Message
        colors={colors}
        text={error}
        onBack={() => router.replace('/(tabs)/practice')}
        onRetry={load}
      />
    )
  }

  if (questions.length === 0) {
    return (
      <Message
        colors={colors}
        text="This paper has no questions on it. Set a new exam from Practice."
        onBack={() => router.replace('/(tabs)/practice')}
      />
    )
  }

  const progress = questions.length > 0 ? (index + 1) / questions.length : 0

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Pressable onPress={leave} hitSlop={10} style={styles.headerBtn}>
          <Ionicons name="close" size={22} color={colors.subtext} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <ThemedText style={[styles.headerTitle, { color: colors.oppositeColor }]} numberOfLines={1}>
            {exam?.session.subject || exam?.session.title || 'Exam'}
          </ThemedText>
          <ThemedText style={[styles.headerMeta, { color: colors.subtext }]}>
            {stage === 'review'
              ? `${answeredCount} of ${questions.length} answered`
              : `Question ${index + 1} of ${questions.length} · ${answeredCount} answered`}
          </ThemedText>
        </View>
        {stage === 'sitting' ? (
          <Pressable onPress={() => setStage('review')} hitSlop={10} style={styles.headerBtn}>
            <ThemedText style={[styles.headerAction, { color: colors.tint }]}>Review</ThemedText>
          </Pressable>
        ) : (
          <View style={styles.headerBtn} />
        )}
      </View>

      <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
        <View
          style={[
            styles.progressFill,
            {
              backgroundColor: colors.tint,
              width: `${(stage === 'review' ? 1 : progress) * 100}%`,
            },
          ]}
        />
      </View>

      {unsaved ? (
        <View style={[styles.banner, { backgroundColor: colors.warningBg }]}>
          <Ionicons name="cloud-offline-outline" size={15} color={colors.warning} />
          <ThemedText style={{ color: colors.oppositeColor, fontSize: 12, flex: 1 }}>
            Your last answer could not be saved to the server. It still counts here — reconnect before
            you submit.
          </ThemedText>
        </View>
      ) : null}

      {error ? (
        <View style={[styles.banner, { backgroundColor: colors.dangerBg }]}>
          <Ionicons name="alert-circle" size={15} color={colors.danger} />
          <ThemedText style={{ color: colors.oppositeColor, fontSize: 12, flex: 1 }}>{error}</ThemedText>
        </View>
      ) : null}

      {stage === 'sitting' && question ? (
        <>
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={{ padding: 20, paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.qHead}>
              <View style={[styles.qNum, { backgroundColor: colors.brandSoft }]}>
                <ThemedText style={[styles.qNumText, { color: colors.tint }]}>
                  {String(question.questionNumber).padStart(2, '0')}
                </ThemedText>
              </View>
              {question.topic ? (
                <View style={[styles.topicPill, { backgroundColor: colors.inputBg }]}>
                  <ThemedText style={[styles.topicText, { color: colors.subtext }]}>
                    {question.topic}
                  </ThemedText>
                </View>
              ) : null}
            </View>

            <ThemedText style={[styles.questionText, { color: colors.oppositeColor }]}>
              {question.questionText}
            </ThemedText>

            <ThemedText style={[styles.chooseHint, { color: colors.muted }]}>
              {copy.listeningLabel}
            </ThemedText>

            {question.options.map((option) => {
              const selected = answers[question.id] === option.label
              return (
                <Pressable
                  key={option.label}
                  onPress={() => choose(option.label)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  style={[
                    styles.option,
                    {
                      backgroundColor: selected ? colors.brandSoft : colors.card,
                      borderColor: selected ? colors.tint : colors.border,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.optionLabel,
                      {
                        backgroundColor: selected ? colors.tint : colors.inputBg,
                        borderColor: selected ? colors.tint : colors.border,
                      },
                    ]}
                  >
                    <ThemedText
                      style={[styles.optionLabelText, { color: selected ? '#fff' : colors.subtext }]}
                    >
                      {option.label}
                    </ThemedText>
                  </View>
                  <ThemedText style={[styles.optionText, { color: colors.oppositeColor }]}>
                    {option.text}
                  </ThemedText>
                </Pressable>
              )
            })}
          </ScrollView>

          <View style={[styles.footer, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
            <Pressable
              onPress={() => goTo(index - 1)}
              disabled={index === 0}
              style={[
                styles.navBtn,
                { borderColor: colors.border, opacity: index === 0 ? 0.4 : 1 },
              ]}
            >
              <Ionicons name="chevron-back" size={16} color={colors.oppositeColor} />
              <ThemedText style={[styles.navText, { color: colors.oppositeColor }]}>Previous</ThemedText>
            </Pressable>

            {index === questions.length - 1 ? (
              <Pressable
                onPress={() => setStage('review')}
                style={[styles.navBtn, styles.navPrimary, { backgroundColor: colors.tint }]}
              >
                <ThemedText style={[styles.navText, { color: '#fff' }]}>Review Answers</ThemedText>
                <Ionicons name="list" size={16} color="#fff" />
              </Pressable>
            ) : (
              <Pressable
                onPress={() => goTo(index + 1)}
                style={[styles.navBtn, styles.navPrimary, { backgroundColor: colors.tint }]}
              >
                <ThemedText style={[styles.navText, { color: '#fff' }]}>Next</ThemedText>
                <Ionicons name="chevron-forward" size={16} color="#fff" />
              </Pressable>
            )}
          </View>
        </>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={{ padding: 20, paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
          >
            <ThemedText style={[styles.reviewTitle, { color: colors.oppositeColor }]}>
              Review your answers
            </ThemedText>
            <ThemedText style={[styles.reviewSub, { color: colors.subtext }]}>
              {examCopy!.reviewSubtitle ??
                'Check your answers before you submit. Nothing is marked until you complete the exam.'}
            </ThemedText>

            <View style={[styles.tallyCard, { backgroundColor: colors.card }]}>
              <Tally label="Answered" value={answeredCount} color={colors.success} colors={colors} />
              <Tally
                label="Left blank"
                value={blanks}
                color={blanks > 0 ? colors.warning : colors.subtext}
                colors={colors}
              />
              <Tally label="Questions" value={questions.length} color={colors.tint} colors={colors} />
            </View>

            {questions.map((item, position) => {
              const choice = answers[item.id]
              const chosen = item.options.find((option) => option.label === choice)

              return (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    setStage('sitting')
                    goTo(position)
                  }}
                  style={[styles.reviewRow, { backgroundColor: colors.card }]}
                >
                  <View
                    style={[
                      styles.reviewNum,
                      { backgroundColor: choice ? colors.brandSoft : colors.warningBg },
                    ]}
                  >
                    <ThemedText
                      style={[
                        styles.reviewNumText,
                        { color: choice ? colors.tint : colors.warning },
                      ]}
                    >
                      {item.questionNumber}
                    </ThemedText>
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText
                      style={[styles.reviewQuestion, { color: colors.oppositeColor }]}
                      numberOfLines={2}
                    >
                      {item.questionText}
                    </ThemedText>
                    <ThemedText
                      style={[
                        styles.reviewAnswer,
                        { color: choice ? colors.subtext : colors.warning },
                      ]}
                      numberOfLines={1}
                    >
                      {chosen ? `${choice}. ${chosen.text}` : 'Not answered'}
                    </ThemedText>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                </Pressable>
              )
            })}
          </ScrollView>

          <View style={[styles.footer, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
            <Pressable
              onPress={() => setStage('sitting')}
              disabled={isSubmitting}
              style={[styles.navBtn, { borderColor: colors.border, opacity: isSubmitting ? 0.4 : 1 }]}
            >
              <Ionicons name="chevron-back" size={16} color={colors.oppositeColor} />
              <ThemedText style={[styles.navText, { color: colors.oppositeColor }]}>
                Back to Paper
              </ThemedText>
            </Pressable>

            <Pressable
              onPress={confirmSubmit}
              disabled={isSubmitting}
              style={[
                styles.navBtn,
                styles.navPrimary,
                { backgroundColor: colors.success, opacity: isSubmitting ? 0.7 : 1 },
              ]}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="checkmark-circle" size={16} color="#fff" />
              )}
              <ThemedText style={[styles.navText, { color: '#fff' }]}>
                {isSubmitting ? 'Marking...' : examCopy!.submitCta}
              </ThemedText>
            </Pressable>
          </View>
        </>
      )}
    </SafeAreaView>
  )
}

function Tally({
  label,
  value,
  color,
  colors,
}: {
  label: string
  value: number
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

function Message({
  colors,
  text,
  onBack,
  onRetry,
}: {
  colors: Colours
  text: string
  onBack: () => void
  onRetry?: () => void
}) {
  return (
    <SafeAreaView style={[styles.centered, { backgroundColor: colors.background }]}>
      <Ionicons name="alert-circle-outline" size={34} color={colors.danger} />
      <ThemedText style={{ color: colors.subtext, textAlign: 'center', marginVertical: 12 }}>
        {text}
      </ThemedText>
      {onRetry ? (
        <Pressable style={[styles.messageBtn, { backgroundColor: colors.tint }]} onPress={onRetry}>
          <ThemedText style={{ color: '#fff', fontWeight: '700' }}>Try Again</ThemedText>
        </Pressable>
      ) : null}
      <Pressable style={[styles.messageBtn, { borderWidth: 1, borderColor: colors.border }]} onPress={onBack}>
        <ThemedText style={{ color: colors.oppositeColor, fontWeight: '700' }}>Back to Practice</ThemedText>
      </Pressable>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  messageBtn: { paddingHorizontal: 22, paddingVertical: 11, borderRadius: 999 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerBtn: { minWidth: 46, alignItems: 'center' },
  headerTitle: { fontSize: 15, fontWeight: '700' },
  headerMeta: { fontSize: 12, marginTop: 2 },
  headerAction: { fontSize: 13, fontWeight: '700' },

  progressTrack: { height: 3, width: '100%' },
  progressFill: { height: '100%' },

  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },

  qHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  qNum: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  qNumText: { fontWeight: '800', fontSize: 14 },
  topicPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  topicText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },

  questionText: { fontSize: 19, fontWeight: '700', lineHeight: 27, marginBottom: 8 },
  chooseHint: { fontSize: 12, marginBottom: 16 },

  option: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 14,
    marginBottom: 10,
  },
  optionLabel: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionLabelText: { fontWeight: '800', fontSize: 13 },
  optionText: { flex: 1, fontSize: 15, lineHeight: 22, paddingTop: 3 },

  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  navBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 13,
  },
  navPrimary: { borderColor: 'transparent' },
  navText: { fontWeight: '700', fontSize: 14 },

  reviewTitle: { fontSize: 22, fontWeight: '800', marginBottom: 8 },
  reviewSub: { fontSize: 13, lineHeight: 20, marginBottom: 18 },

  tallyCard: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderRadius: 14,
    padding: 16,
    marginBottom: 18,
  },
  tally: { alignItems: 'center', gap: 3 },
  tallyValue: { fontSize: 22, fontWeight: '800' },
  tallyLabel: { fontSize: 11 },

  reviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  reviewNum: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  reviewNumText: { fontWeight: '800', fontSize: 13 },
  reviewQuestion: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  reviewAnswer: { fontSize: 12, marginTop: 3 },
})
