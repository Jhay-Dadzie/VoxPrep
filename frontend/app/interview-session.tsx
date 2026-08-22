import React from 'react'
import { StyleSheet, View, ScrollView, Image, Pressable, ActivityIndicator } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ThemedText } from '@/components/themed-text'
import { VoiceWave } from '@/components/voice-wave'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { useMode } from '@/hooks/mode-context'
import { useInterviewer } from '@/hooks/interviewer-context'
import { avatarSource, shortName } from '@/constants/interviewers'
import { Colors } from '@/constants/theme'
import { useAgentSession } from '@/hooks/use-agent-session'
import { clearPreparedSession, getPreparedSession } from '@/lib/prepared-session'

const pad = (n: number) => n.toString().padStart(2, '0')

export default function InterviewSession() {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const { modeId, mode, copy } = useMode()
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
      offersCvTailoring={mode.offersCvTailoring}
      interviewer={interviewer}
    />
  )
}

function RunningSession({
  sessionId,
  colors,
  copy,
  modeId,
  offersCvTailoring,
  interviewer,
}: {
  sessionId: string
  colors: typeof Colors.light
  copy: ReturnType<typeof useMode>['copy']
  modeId: ReturnType<typeof useMode>['modeId']
  offersCvTailoring: boolean
  interviewer: ReturnType<typeof useInterviewer>['interviewer']
}) {
  // One voice holds the call. A panel that swapped speakers mid-conversation
  // would mean reconfiguring the agent between turns, which is the round trip
  // this whole architecture exists to avoid — so the chair speaks throughout,
  // and the panel's size is sent along so they can question on its behalf.
  const panelist = interviewer.members[0]

  const prepared = getPreparedSession(sessionId)

  const session = useAgentSession({
    sessionId,
    mode: modeId,
    voice: panelist?.voiceId,
    panelSize: interviewer.size,
    maxQuestions: prepared?.maxQuestions,
    // For a job interview the CV step sits between the session and its
    // results: it is the one moment the job description, a graded interview and
    // the candidate's attention all exist at once, and it hands off to results
    // whether they take it or skip it. Every other mode goes straight there —
    // a syllabus and a consular officer's questions are not something a CV can
    // be rewritten against.
    onFinished: () => {
      clearPreparedSession()
      router.replace(
        offersCvTailoring
          ? { pathname: '/cv-tailor', params: { sessionId } }
          : { pathname: '/(tabs)/results', params: { sessionId } }
      )
    },
  })

  const mm = Math.floor(session.elapsedSeconds / 60)
  const ss = session.elapsedSeconds % 60
  const position = Math.max(1, session.askedCount)
  const speakerName = panelist ? shortName(panelist) : 'The interviewer'

  const statusLabel =
    session.phase === 'connecting'
      ? 'Connecting you to the interviewer...'
      : session.phase === 'closing'
        ? `${speakerName} is wrapping up...`
        : session.phase === 'grading'
          ? 'Assessing the whole interview — this takes a moment...'
          : session.phase === 'error'
            ? 'The interview is paused.'
            : session.isAgentSpeaking
              ? `${speakerName} is speaking...`
              : copy.listeningLabel

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.card }} edges={['top']}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <ThemedText style={[styles.brand, { color: colors.tint }]}>VoxPrep</ThemedText>
        <View style={{ flex: 1 }} />
        <Pressable
          hitSlop={10}
          onPress={session.endEarly}
          disabled={session.phase === 'closing' || session.phase === 'grading' || session.phase === 'done'}
        >
          <ThemedText style={{ color: colors.subtext, fontWeight: '600' }}>End</ThemedText>
        </Pressable>
      </View>

      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topRow}>
          <View style={[styles.timerPill, { backgroundColor: colors.card }]}>
            <View style={[styles.recDot, { opacity: session.isListening ? 1 : 0.3 }]} />
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
                {session.isAgentSpeaking ? 'SPEAKING NOW' : copy.questionTag}
              </ThemedText>
            </View>

            <ThemedText style={[styles.questionText, { color: colors.oppositeColor }]}>
              {session.currentQuestion ??
                (session.phase === 'error' ? '' : `${speakerName} is joining the call...`)}
            </ThemedText>
          </View>
        </View>

        <View style={[styles.aiCard, { backgroundColor: colors.card }]}>
          <View style={styles.aiAvatarWrap}>
            {panelist ? <Image source={avatarSource(panelist)} style={styles.aiAvatar} /> : null}
            <View
              style={[
                styles.statusDot,
                { borderColor: colors.card, backgroundColor: session.isListening ? '#22C55E' : '#F59E0B' },
              ]}
            />
          </View>

          <ThemedText style={[styles.aiLabel, { color: colors.oppositeColor }]}>{statusLabel}</ThemedText>

          {/* The wave tracks real microphone level, so it only moves when the
              mic is actually live — a wave that animated regardless would say
              "you are being heard" at the exact moment that might be false. */}
          <VoiceWave
            levels={session.levels}
            color={session.isListening ? colors.tint : colors.border}
            idle={!session.isListening}
          />
        </View>

        {session.error ? (
          <View style={[styles.errorBox, { backgroundColor: colors.brandSoft }]}>
            <Ionicons name="alert-circle" size={16} color="#EF4444" />
            <ThemedText style={{ color: colors.oppositeColor, fontSize: 13, flex: 1 }}>
              {session.error}
            </ThemedText>
          </View>
        ) : null}

        {session.phase === 'error' ? (
          <Pressable style={[styles.stopBtn, { backgroundColor: colors.tint }]} onPress={session.abandon}>
            <Ionicons name="documents-outline" size={18} color="#fff" />
            <ThemedText style={styles.stopBtnText}>End here and see my results</ThemedText>
          </Pressable>
        ) : null}

        {/* The conversation as it happens. In a voice interview this is the
            only record the candidate has of what was actually said. */}
        {session.transcript.length > 0 ? (
          <View style={[styles.transcriptCard, { backgroundColor: colors.inputBg }]}>
            <View style={styles.transcriptHeader}>
              <Ionicons name="chatbubbles-outline" size={16} color={colors.subtext} />
              <ThemedText style={[styles.transcriptLabel, { color: colors.subtext }]}>
                CONVERSATION
              </ThemedText>
            </View>

            {session.transcript.map((line, index) => (
              <View key={`${index}-${line.role}`} style={styles.turn}>
                <ThemedText style={[styles.turnWho, { color: line.role === 'user' ? colors.tint : colors.subtext }]}>
                  {line.role === 'user' ? 'You' : speakerName}
                </ThemedText>
                <ThemedText style={[styles.turnText, { color: colors.oppositeColor }]}>
                  {line.content}
                </ThemedText>
              </View>
            ))}
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
      <ThemedText style={{ color: colors.oppositeColor, textAlign: 'center', marginTop: 16 }}>
        {message}
      </ThemedText>
      {onBack ? (
        <Pressable
          style={[styles.stopBtn, { backgroundColor: colors.tint, marginTop: 24, paddingHorizontal: 32 }]}
          onPress={onBack}
        >
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
  aiLabel: { fontWeight: '600', fontSize: 14, marginBottom: 10, textAlign: 'center' },

  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, marginBottom: 14 },

  stopBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 999, height: 52, marginBottom: 16,
  },
  stopBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  transcriptCard: { borderRadius: 12, padding: 16 },
  transcriptHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  transcriptLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  turn: { marginBottom: 12 },
  turnWho: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 3 },
  turnText: { fontSize: 14, lineHeight: 21 },
})
