import React, { useEffect, useState } from 'react'
import { StyleSheet, View, ScrollView, Image, Pressable, TextInput, ActivityIndicator } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ThemedText } from '@/components/themed-text'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { useMode } from '@/hooks/mode-context'
import { useInterviewer } from '@/hooks/interviewer-context'
import { avatarSource, shortName } from '@/constants/interviewers'
import { Colors } from '@/constants/theme'
import { useInterviewSession } from '@/hooks/use-interview-session'
import { clearPreparedSession, getPreparedSession } from '@/lib/prepared-session'
import type { InterviewQuestion } from '@/types/interview'

const pad = (n: number) => n.toString().padStart(2, '0')

const TYPE_LABEL: Record<InterviewQuestion['type'], string> = {
  behavioral: 'BEHAVIORAL QUESTION',
  technical: 'TECHNICAL QUESTION',
  situational: 'SITUATIONAL QUESTION',
  general: 'GENERAL QUESTION',
}

export default function InterviewSession() {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const { modeId, copy } = useMode()
  const { interviewer } = useInterviewer()
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>()

  if (!sessionId) {
    return (
      <SessionMessage
        colors={colors}
        message="This session is missing an id. Start a new one from Practice."
        onBack={() => router.replace('/(tabs)/practice')}
      />
    )
  }

  return (
    <RunningSession
      sessionId={sessionId}
      colors={colors}
      copy={copy}
      modeId={modeId}
      interviewer={interviewer}
    />
  )
}

function RunningSession({
  sessionId,
  colors,
  copy,
  modeId,
  interviewer,
}: {
  sessionId: string
  colors: typeof Colors.light
  copy: ReturnType<typeof useMode>['copy']
  modeId: ReturnType<typeof useMode>['modeId']
  interviewer: ReturnType<typeof useInterviewer>['interviewer']
}) {
  const [typed, setTyped] = useState('')

  // Panelists take turns so a multi-voice panel actually sounds like one.
  const panelist = interviewer.members[0]

  // The setup screen leaves the session's question cap here; a session reopened
  // without it falls back to the server's own ceiling.
  const prepared = getPreparedSession(sessionId)

  const session = useInterviewSession({
    sessionId,
    mode: modeId,
    voice: panelist?.voiceId,
    maxQuestions: prepared?.maxQuestions,
    onFinished: () => {
      clearPreparedSession()
      // The history detail screen renders the real graded session; the results
      // tab is still placeholder content.
      router.replace({ pathname: '/history/[id]', params: { id: sessionId } })
    },
  })

  const position = Math.max(1, session.askedCount)
  const speaker = interviewer.members[(position - 1) % interviewer.members.length] ?? panelist
  const mm = Math.floor(session.elapsedSeconds / 60)
  const ss = session.elapsedSeconds % 60
  const busy =
    session.phase === 'submitting' ||
    session.phase === 'thinking' ||
    session.phase === 'finishing' ||
    session.phase === 'grading'

  useEffect(() => {
    setTyped('')
  }, [session.question?.id])

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.card }} edges={['top']}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <ThemedText style={[styles.brand, { color: colors.tint }]}>VoxPrep</ThemedText>
        <View style={{ flex: 1 }} />
        <Pressable hitSlop={10} onPress={session.endEarly} disabled={session.phase === 'finishing' || session.phase === 'grading'}>
          <ThemedText style={{ color: colors.subtext, fontWeight: '600' }}>End</ThemedText>
        </Pressable>
      </View>

      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.topRow}>
          <View style={[styles.timerPill, { backgroundColor: colors.card }]}>
            <View style={[styles.recDot, { opacity: session.phase === 'answering' ? 1 : 0.3 }]} />
            <ThemedText style={[styles.timerText, { color: colors.oppositeColor }]}>
              {pad(mm)}:{pad(ss)}
            </ThemedText>
          </View>
          <View style={[styles.qPill, { backgroundColor: colors.card }]}>
            <ThemedText style={[styles.qLabel, { color: colors.subtext }]}>QUESTION</ThemedText>
            {/* "up to" because the interviewer decides when it has heard
                enough — the cap is a ceiling, not a target. */}
            <ThemedText style={[styles.qVal, { color: colors.oppositeColor }]}>
              {position} of up to {session.maxQuestions}
            </ThemedText>
          </View>
        </View>

        <View style={[styles.questionCard, { backgroundColor: colors.card }]}>
          <LinearGradient
            colors={['#7A4CF0', colors.tint]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.questionAccent}
          />

          <View style={styles.questionInner}>
            <View style={[styles.tag, { backgroundColor: colors.brandSoft }]}>
              <ThemedText style={[styles.tagText, { color: colors.tint }]}>
                {session.question ? TYPE_LABEL[session.question.type] : copy.questionTag}
              </ThemedText>
            </View>

            <ThemedText style={[styles.questionText, { color: colors.oppositeColor }]}>
              {session.question?.questionText ??
                (session.phase === 'error'
                  ? ''
                  : `${speaker ? shortName(speaker) : 'The interviewer'} is preparing your first question...`)}
            </ThemedText>
          </View>
        </View>

        <Pressable
          style={[
            styles.replayBtn,
            {
              borderColor: colors.tint,
              backgroundColor: colors.card,
              marginTop: 16,
              opacity: session.canReplay ? 1 : 0.5,
            },
          ]}
          onPress={session.replayQuestion}
          disabled={!session.canReplay || session.isReplaying}
        >
          {session.isReplaying ? (
            <ActivityIndicator size="small" color={colors.tint} />
          ) : (
            <Ionicons name="refresh" size={16} color={colors.tint} />
          )}
          <ThemedText style={{ color: colors.tint, fontWeight: '700' }}>
            {session.isReplaying ? 'Loading...' : copy.replayLabel}
          </ThemedText>
        </Pressable>

        <View style={[styles.aiCard, { backgroundColor: colors.card }]}>
          <View style={styles.aiAvatarWrap}>
            {speaker ? <Image source={avatarSource(speaker)} style={styles.aiAvatar} /> : null}
            <View
              style={[
                styles.statusDot,
                { borderColor: colors.card, backgroundColor: session.phase === 'answering' ? '#22C55E' : '#F59E0B' },
              ]}
            />
          </View>

          <ThemedText style={[styles.aiLabel, { color: colors.oppositeColor }]}>
            {session.phase === 'thinking'
              ? `${speaker ? shortName(speaker) : 'The interviewer'} is thinking about what to ask next...`
              : session.phase === 'asking'
                ? `${speaker ? shortName(speaker) : 'The interviewer'} is speaking...`
                : session.phase === 'answering'
                  ? session.micAvailable
                    ? copy.listeningLabel
                    : 'Microphone unavailable — type your answer'
                  : session.phase === 'submitting'
                    ? 'Transcribing your answer...'
                    : session.phase === 'finishing'
                      ? session.closingRemark ?? 'Wrapping up...'
                      : session.phase === 'grading'
                        ? 'Assessing the whole interview — this takes a moment...'
                        : session.phase === 'error'
                          ? 'The interview is paused.'
                          : 'Getting ready...'}
          </ThemedText>

          <View style={styles.miniBars}>
            {session.bars.map((h, i) => (
              <View key={i} style={{ width: 3, height: h, borderRadius: 2, backgroundColor: colors.tint }} />
            ))}
          </View>
        </View>

        {session.error ? (
          <View style={[styles.errorBox, { backgroundColor: colors.brandSoft }]}>
            <Ionicons name="alert-circle" size={16} color="#EF4444" />
            <ThemedText style={{ color: colors.oppositeColor, fontSize: 13, flex: 1 }}>{session.error}</ThemedText>
          </View>
        ) : null}

        {session.phase === 'error' ? (
          <>
            <Pressable style={[styles.stopBtn, { backgroundColor: colors.tint }]} onPress={session.retry}>
              <Ionicons name="refresh" size={18} color="#fff" />
              <ThemedText style={styles.stopBtnText}>Try again</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.replayBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
              onPress={session.endEarly}
            >
              <ThemedText style={{ color: colors.subtext, fontWeight: '700' }}>
                End here and see my results
              </ThemedText>
            </Pressable>
          </>
        ) : session.needsTypedAnswer && session.phase === 'answering' ? (
          <View style={[styles.typedCard, { backgroundColor: colors.inputBg }]}>
            <ThemedText style={[styles.transcriptLabel, { color: colors.subtext }]}>TYPE YOUR ANSWER</ThemedText>
            <TextInput
              multiline
              value={typed}
              onChangeText={setTyped}
              placeholder="Type what you would have said..."
              placeholderTextColor={colors.muted}
              style={[styles.typedInput, { color: colors.oppositeColor }]}
              textAlignVertical="top"
            />
            <Pressable
              style={[styles.stopBtn, { backgroundColor: typed.trim() ? colors.tint : colors.border, marginBottom: 0 }]}
              onPress={() => session.submitTypedAnswer(typed)}
              disabled={!typed.trim() || busy}
            >
              <ThemedText style={styles.stopBtnText}>Submit Answer</ThemedText>
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={[styles.stopBtn, { backgroundColor: session.phase === 'answering' ? colors.tint : colors.border }]}
            onPress={session.submitAnswer}
            disabled={session.phase !== 'answering' || busy}
          >
            {busy ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="checkmark-circle" size={18} color="#fff" />
            )}
            <ThemedText style={styles.stopBtnText}>
              {busy ? 'Submitting...' : copy.submitLabel}
            </ThemedText>
          </Pressable>
        )}

        {session.transcript ? (
          <View style={[styles.transcriptCard, { backgroundColor: colors.inputBg }]}>
            <View style={styles.transcriptHeader}>
              <Ionicons name="reorder-three" size={16} color={colors.subtext} />
              <ThemedText style={[styles.transcriptLabel, { color: colors.subtext }]}>LAST ANSWER</ThemedText>
            </View>
            <ThemedText style={[styles.transcriptText, { color: colors.oppositeColor }]}>
              {session.transcript}
            </ThemedText>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}

function SessionMessage({
  colors,
  message,
  busy,
  onBack,
}: {
  colors: typeof Colors.light
  message: string
  busy?: boolean
  onBack?: () => void
}) {
  return (
    <SafeAreaView style={[styles.messageRoot, { backgroundColor: colors.background }]}>
      {busy ? <ActivityIndicator color={colors.tint} size="large" /> : null}
      <ThemedText style={{ color: colors.oppositeColor, textAlign: 'center', marginTop: 16 }}>{message}</ThemedText>
      {onBack ? (
        <Pressable style={[styles.stopBtn, { backgroundColor: colors.tint, marginTop: 24, paddingHorizontal: 32 }]} onPress={onBack}>
          <ThemedText style={styles.stopBtnText}>Back to Practice</ThemedText>
        </Pressable>
      ) : null}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1 },
  brand: { fontWeight: '700', fontSize: 17 },

  messageRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },

  topRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 14 },
  timerPill: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444' },
  timerText: { fontWeight: '700', fontSize: 14 },
  qPill: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  qLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  qVal: { fontWeight: '700', fontSize: 14 },

  replayBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 999, borderWidth: 1, paddingVertical: 13, marginBottom: 14,
  },

  questionCard: { borderRadius: 14, overflow: 'hidden', flexDirection: 'row', marginTop: 2 },
  questionAccent: { width: 6 },
  questionInner: { flex: 1, padding: 16 },
  tag: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, marginBottom: 12 },
  tagText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  questionText: { fontSize: 16, lineHeight: 24 },

  aiCard: { borderRadius: 14, padding: 22, alignItems: 'center', marginTop: 16, marginBottom: 16 },
  aiAvatarWrap: { width: 110, height: 110, marginBottom: 12 },
  aiAvatar: { width: 110, height: 110, borderRadius: 55 },
  statusDot: {
    position: 'absolute', right: 4, bottom: 4,
    width: 18, height: 18, borderRadius: 9, borderWidth: 3,
  },
  aiLabel: { fontWeight: '600', fontSize: 14, marginBottom: 8, textAlign: 'center' },
  miniBars: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 42 },

  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, marginBottom: 14 },

  stopBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 999, height: 52, marginBottom: 16,
  },
  stopBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  typedCard: { borderRadius: 12, padding: 16, marginBottom: 16, gap: 10 },
  typedInput: { minHeight: 110, fontSize: 14, lineHeight: 20 },

  transcriptCard: { borderRadius: 12, padding: 16 },
  transcriptHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  transcriptLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  transcriptText: { fontSize: 14, lineHeight: 22 },
})
