import React, { useCallback, useEffect, useRef, useState } from 'react'
import { StyleSheet, View, ScrollView, Image, Pressable, ActivityIndicator } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  AudioModule,
  setAudioModeAsync,
} from 'expo-audio'
import { ThemedText } from '@/components/themed-text'
import { ModeBadge } from '@/components/mode-badge'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { useMode } from '@/hooks/mode-context'
import { useInterviewer } from '@/hooks/interviewer-context'
import { useSession } from '@/hooks/session-context'
import { submitAnswer, completeSession, ApiError } from '@/services/api'
import { speakQuestion, stopSpeaking } from '@/services/speech'
import * as FileSystem from 'expo-file-system/legacy'
import { Colors } from '@/constants/theme'
import type { Panelist } from '@/constants/interviewers'

const BAR_COUNT = 12

const PLACEHOLDER_QUESTION =
  'Tell me about a time you had to handle a difficult situation with a colleague. How did you resolve it?'

/** speaking → ready → recording → processing → answered, then Next starts over. */
type Phase = 'speaking' | 'ready' | 'recording' | 'processing' | 'answered'

/**
 * Audio session for reading the question aloud.
 *
 * `allowsRecording` must be false here. Leaving it on keeps the session in
 * record-and-play mode, which routes output to the earpiece rather than the
 * loudspeaker — the question is then audible but very quiet.
 */
const PLAYBACK_MODE = {
  allowsRecording: false,
  playsInSilentMode: true,
  shouldRouteThroughEarpiece: false,
} as const

/** Audio session while capturing an answer. */
const RECORD_MODE = {
  allowsRecording: true,
  playsInSilentMode: true,
  shouldRouteThroughEarpiece: false,
} as const

const RECORDER_OPTIONS = { ...RecordingPresets.LOW_QUALITY, isMeteringEnabled: true }

function meteringToHeight(db: number) {
  // expo-audio metering returns dBFS, typically -160 (silent) to 0 (peak).
  const clamped = Math.max(-60, Math.min(0, db ?? -60))
  const norm = (clamped + 60) / 60 // 0..1
  return 6 + norm * 36 // 6..42 px
}

const AVATAR = 'https://i.pravatar.cc/100?img=12'

function pad(n: number) {
  return n.toString().padStart(2, '0')
}

export default function InterviewSession() {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const { copy, modeId } = useMode()
  const { interviewer } = useInterviewer()
  const { session, hasSession, current, position, total, next, insertFollowUp, currentIsFollowUp } =
    useSession()
  const [transcript, setTranscript] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [micReady, setMicReady] = useState(false)

  /**
   * One turn, start to finish. The recorder is only ever open during
   * `recording`, so the question is never captured as part of the answer.
   */
  const [phase, setPhase] = useState<Phase>('speaking')
  const speaking = phase === 'speaking'
  const submitting = phase === 'processing'

  const questionText = current?.question_text ?? PLACEHOLDER_QUESTION
  /** Whoever is chairing asks the question. */
  const asker = interviewer.members[0] ?? null

  // Without a generated set there is nothing to advance through, so the
  // placeholder question behaves as a single-question session.
  const isLast = !hasSession || position >= total
  // Counts this answer, not the whole session, so it resets on Next Question.
  const [seconds, setSeconds] = useState(0)
  const [bars, setBars] = useState<number[]>(Array(BAR_COUNT).fill(8))

  const onMeter = useRef((status: any) => {
    const m = status?.metering
    if (typeof m === 'number') {
      const next = meteringToHeight(m)
      setBars((prev) => [...prev.slice(1), next])
    }
  }).current
  const recorder = useAudioRecorder(RECORDER_OPTIONS, onMeter)
  // Polled so the metering callback keeps firing, which is what drives the
  // waveform. The status object itself is no longer read — `phase` is the
  // single source of truth for what the screen is doing.
  useAudioRecorderState(recorder, 100)
  const startedRef = useRef(false)

  // Only runs while actually recording, so the timer measures the answer.
  useEffect(() => {
    if (phase !== 'recording') return
    const i = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(i)
  }, [phase])

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    ;(async () => {
      try {
        const perm = await AudioModule.requestRecordingPermissionsAsync()
        if (!perm.granted) {
          setNotice(
            'Microphone permission was denied. Enable it for VoxPrep in your device settings, then reopen this screen.',
          )
          return
        }
        // Start in playback mode — the first thing that happens is the
        // interviewer speaking, not the candidate answering.
        await setAudioModeAsync(PLAYBACK_MODE)
        setMicReady(true)
      } catch (err) {
        // Silent failure here used to leave a flat waveform and no explanation.
        setNotice(
          `Could not prepare the microphone: ${err instanceof Error ? err.message : 'unknown error'}`,
        )
      }
    })()
    return () => {
      stopSpeaking()
      ;(async () => {
        try {
          await recorder.stop()
        } catch {
          /* noop */
        }
      })()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const mm = Math.floor(seconds / 60)
  const ss = seconds % 60

  /**
   * Stop recording, send the audio for transcription and scoring, then start a
   * fresh recording for the next answer.
   *
   * Returns the result so the caller can act on a follow-up. Failures are
   * surfaced as a notice and never block moving on — losing feedback is
   * survivable mid-interview, being stuck is not.
   */
  const submitCurrentAnswer = async () => {
    // No id means the session was never saved server-side, so there is nothing
    // to attach an answer to. Stop cleanly and let the interview continue
    // unscored rather than trapping the user with a running recorder.
    if (!current?.id) {
      try {
        await recorder.stop()
      } catch {
        /* was not recording */
      }
      setNotice(
        'This session was not saved, so answers cannot be scored. Restart the backend and start again from Practice.',
      )
      setPhase('answered')
      return null
    }

    setPhase('processing')
    setNotice(null)
    try {
      await recorder.stop()
      const uri = recorder.uri
      if (!uri) {
        throw new Error('Recording produced no file — the microphone may not have started.')
      }

      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      })

      const result = await submitAnswer({
        questionId: current.id,
        mode: modeId,
        base64,
        mimeType: 'audio/m4a',
        durationSeconds: seconds,
      })

      if (result.silent) {
        setNotice('No speech was picked up. Check your microphone and try again.')
        return null
      }

      setTranscript(result.transcript?.text ?? null)
      return result
    } catch (err) {
      // Show the real reason. A generic message here is what made this hard to
      // diagnose in the first place.
      setNotice(
        err instanceof ApiError
          ? err.message
          : `Could not process that answer: ${err instanceof Error ? err.message : 'unknown error'}`,
      )
      return null
    } finally {
      setPhase('answered')
    }
  }

  /**
   * Read the question aloud, then wait.
   *
   * Recording is not started here — the candidate decides when to begin, which
   * is both what a real interview feels like and what stops the interviewer's
   * own voice being captured as part of the answer.
   */
  const askQuestion = useCallback(
    async (text: string) => {
      try {
        await recorder.stop()
      } catch {
        /* was not recording */
      }

      setPhase('speaking')
      await setAudioModeAsync(PLAYBACK_MODE).catch(() => {})
      await speakQuestion(text, asker)
      setSeconds(0)
      setPhase('ready')
    },
    // recorder is stable for the life of the screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [asker],
  )

  /** Open the mic. Switches the audio session back to record mode first. */
  const startRecording = async () => {
    stopSpeaking()
    try {
      await setAudioModeAsync(RECORD_MODE)
      await recorder.prepareToRecordAsync()
      recorder.record()
      setSeconds(0)
      setBars(Array(BAR_COUNT).fill(8))
      setPhase('recording')
    } catch (err) {
      setNotice(
        `Could not start recording: ${err instanceof Error ? err.message : 'unknown error'}`,
      )
      setPhase('ready')
    }
  }

  /** Finish the answer and send it for transcription and scoring. */
  const stopRecording = async () => {
    const result = await submitCurrentAnswer()

    // Splice the follow-up in now so Next lands on it, while the answer that
    // prompted it is still what the interview is about.
    if (result?.followUp) {
      insertFollowUp({
        // The id comes from the server now — without it the follow-up's own
        // answer has nothing to attach to.
        id: result.followUp.id,
        question_number: result.followUp.question_number,
        question_text: result.followUp.question_text,
        question_type: result.followUp.question_type as any,
        difficulty_level: result.followUp.difficulty_level as any,
        ideal_answer_guidelines: null,
      })
    }
  }

  // Ask whenever the question changes — covers the first question, Next, and a
  // follow-up being spliced in, without each having to remember to speak.
  useEffect(() => {
    if (!micReady) return
    let cancelled = false
    ;(async () => {
      if (cancelled) return
      await askQuestion(questionText)
    })()
    return () => {
      cancelled = true
      stopSpeaking()
    }
  }, [questionText, micReady, askQuestion])

  const goNext = () => {
    next()
    setTranscript(null)
    // The question-changed effect reads the new question aloud from here.
  }

  const finish = async () => {
    // Catch an answer still being recorded when they end the session.
    if (phase === 'recording') await stopRecording()
    stopSpeaking()

    if (session?.sessionId) {
      try {
        await completeSession({ sessionId: session.sessionId })
      } catch {
        /* results screen falls back to what it can read */
      }
    }

    router.replace('/(tabs)/results')
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.card }} edges={['top']}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Image source={{ uri: AVATAR }} style={styles.avatar} />
        <ThemedText style={[styles.brand, { color: colors.tint }]}>VoxPrep</ThemedText>
        <View style={{ flex: 1 }} />
        <ModeBadge />
        <Pressable hitSlop={10} style={{ marginLeft: 10 }}>
          <Ionicons name="notifications-outline" size={22} color={colors.oppositeColor} />
        </Pressable>
      </View>

      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topRow}>
          <View style={[styles.timerPill, { backgroundColor: colors.card }]}>
            <View style={styles.recDot} />
            <ThemedText style={[styles.timerText, { color: colors.oppositeColor }]}>
              {pad(mm)}:{pad(ss)}
            </ThemedText>
          </View>
          <View style={[styles.qPill, { backgroundColor: colors.card }]}>
            <ThemedText style={[styles.qLabel, { color: colors.subtext }]}>QUESTION</ThemedText>
            <ThemedText style={[styles.qVal, { color: colors.oppositeColor }]}>
              {hasSession ? `${position} of ${total}` : '2 of 10'}
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
            {currentIsFollowUp && (
              <View style={[styles.followUpPill, { backgroundColor: colors.warningBg }]}>
                <Ionicons name="return-down-forward" size={13} color={colors.warning} />
                <ThemedText style={[styles.followUpText, { color: colors.warning }]}>
                  FOLLOW-UP
                </ThemedText>
              </View>
            )}
            <View style={[styles.tag, { backgroundColor: colors.brandSoft }]}>
              <ThemedText style={[styles.tagText, { color: colors.tint }]}>
                {current ? current.question_type.toUpperCase() + ' QUESTION' : copy.questionTag}
              </ThemedText>
            </View>

            {/* Falls back to the placeholder when the screen is opened directly
                rather than through practice. */}
            <ThemedText style={[styles.questionText, { color: colors.oppositeColor }]}>
              &ldquo;{questionText}&rdquo;
            </ThemedText>

            <View style={[styles.player, { backgroundColor: colors.inputBg }]}>
              <View style={styles.playerRow}>
                <Pressable
                  style={[styles.playBtn, { backgroundColor: colors.tint }, submitting && { opacity: 0.4 }]}
                  onPress={() => askQuestion(questionText)}
                  disabled={submitting}
                  accessibilityRole="button"
                  accessibilityLabel="Play the question"
                >
                  <Ionicons name={speaking ? 'volume-high' : 'play'} size={18} color="#fff" />
                </Pressable>
                <View style={{ flex: 1 }}>
                  <View style={styles.playerLabels}>
                    <ThemedText style={[styles.playerLabel, { color: colors.subtext }]}>
                      {asker ? `${asker.name} · ${asker.role}` : 'AI Question Voice'}
                    </ThemedText>
                    {/* No timecode: device speech reports no duration or
                        position, and inventing one would be a lie. */}
                    <ThemedText style={[styles.playerTime, { color: colors.subtext }]}>
                      {speaking ? 'Speaking…' : 'Tap to replay'}
                    </ThemedText>
                  </View>
                  <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                    <View
                      style={[
                        styles.progressFill,
                        { backgroundColor: speaking ? colors.tint : colors.border },
                      ]}
                    />
                  </View>
                </View>
              </View>

              <View style={styles.waveform}>
                {WAVE.map((h, i) => (
                  <View
                    key={i}
                    style={{
                      width: 3,
                      height: h,
                      borderRadius: 2,
                      backgroundColor: i < 12 ? colors.tint : colors.border,
                    }}
                  />
                ))}
              </View>
            </View>
          </View>
        </View>

        <Pressable
          style={[
            styles.replayBtn,
            { borderColor: colors.tint, backgroundColor: colors.card, marginTop: 16 },
            (speaking || submitting) && { opacity: 0.5 },
          ]}
          onPress={() => askQuestion(questionText)}
          disabled={speaking || submitting}
          accessibilityRole="button"
          accessibilityState={{ disabled: speaking || submitting }}
        >
          <Ionicons name="refresh" size={16} color={colors.tint} />
          <ThemedText style={{ color: colors.tint, fontWeight: '700' }}>{copy.replayLabel}</ThemedText>
        </Pressable>

        <View style={[styles.aiCard, { backgroundColor: colors.card }]}>
          {interviewer.isPanel ? (
            <View style={styles.panelRow}>
              {interviewer.members.map((m, i) => (
                // The first seat is the one currently asking, so it carries the
                // status dot. Turn-taking becomes real once questions are
                // generated per panelist.
                <PanelSeat key={m.voiceId} member={m} active={i === 0} colors={colors} />
              ))}
            </View>
          ) : (
            <View style={styles.aiAvatarWrap}>
              <Image source={{ uri: interviewer.members[0].avatar }} style={styles.aiAvatar} />
              <View style={[styles.statusDot, { borderColor: colors.card }]} />
            </View>
          )}
          <ThemedText style={[styles.aiLabel, { color: colors.oppositeColor }]}>
            {phase === 'speaking'
              ? `${asker?.name ?? 'Interviewer'} is asking...`
              : phase === 'ready'
                ? 'Tap Record when you are ready to answer'
                : phase === 'recording'
                  ? `${interviewer.listeningLabel}...`
                  : phase === 'processing'
                    ? 'Processing your answer...'
                    : 'Answer received'}
          </ThemedText>
          <View style={styles.miniBars}>
            {bars.map((h, i) => (
              <View
                key={i}
                style={{ width: 3, height: h, borderRadius: 2, backgroundColor: colors.tint }}
              />
            ))}
          </View>
        </View>

        {notice && (
          <View style={[styles.notice, { backgroundColor: colors.warningBg }]}>
            <Ionicons name="alert-circle" size={15} color={colors.warning} />
            <ThemedText style={{ color: colors.warning, fontSize: 12, flex: 1, lineHeight: 17 }}>
              {notice}
            </ThemedText>
          </View>
        )}

        {/* Record control. The candidate opens and closes the mic — the app
            never decides for them. */}
        {phase === 'speaking' && (
          <View style={[styles.stopBtn, { backgroundColor: colors.tint, opacity: 0.6 }]}>
            <Ionicons name="volume-high" size={18} color="#fff" />
            <ThemedText style={styles.stopBtnText}>Listen to the question…</ThemedText>
          </View>
        )}

        {phase === 'ready' && (
          <Pressable
            style={[styles.stopBtn, { backgroundColor: colors.tint }]}
            onPress={startRecording}
            accessibilityRole="button"
            accessibilityLabel="Start recording your answer"
          >
            <Ionicons name="mic" size={20} color="#fff" />
            <ThemedText style={styles.stopBtnText}>Record Answer</ThemedText>
          </Pressable>
        )}

        {phase === 'recording' && (
          <Pressable
            style={[styles.stopBtn, { backgroundColor: colors.danger }]}
            onPress={stopRecording}
            accessibilityRole="button"
            accessibilityLabel="Stop recording and submit your answer"
          >
            <Ionicons name="stop-circle" size={20} color="#fff" />
            <ThemedText style={styles.stopBtnText}>
              Stop &amp; Submit · {pad(mm)}:{pad(ss)}
            </ThemedText>
          </Pressable>
        )}

        {phase === 'processing' && (
          <View style={[styles.stopBtn, { backgroundColor: colors.tint, opacity: 0.6 }]}>
            <ActivityIndicator color="#fff" size="small" />
            <ThemedText style={styles.stopBtnText}>Processing your answer…</ThemedText>
          </View>
        )}

        {phase === 'answered' && (
          <>
            <Pressable
              style={[styles.stopBtn, { backgroundColor: colors.tint }]}
              onPress={isLast ? finish : goNext}
              accessibilityRole="button"
            >
              {isLast ? (
                <>
                  <Ionicons name="checkmark-circle" size={18} color="#fff" />
                  <ThemedText style={styles.stopBtnText}>{copy.submitLabel}</ThemedText>
                </>
              ) : (
                <>
                  <ThemedText style={styles.stopBtnText}>Next Question</ThemedText>
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </>
              )}
            </Pressable>

            <Pressable onPress={startRecording} style={styles.endEarly} accessibilityRole="button">
              <ThemedText style={{ color: colors.tint, fontSize: 13, fontWeight: '600' }}>
                Re-record this answer
              </ThemedText>
            </Pressable>
          </>
        )}

        {!isLast && (phase === 'ready' || phase === 'answered') && (
          <Pressable onPress={finish} style={styles.endEarly} accessibilityRole="button">
            <ThemedText style={{ color: colors.subtext, fontSize: 13, fontWeight: '600' }}>
              End session early
            </ThemedText>
          </Pressable>
        )}

        <View style={[styles.transcriptCard, { backgroundColor: colors.inputBg }]}>
          <View style={styles.transcriptHeader}>
            <Ionicons name="reorder-three" size={16} color={colors.subtext} />
            {/* Not "live": transcription happens after the recording is sent,
                so the label must not claim streaming it does not do. */}
            <ThemedText style={[styles.transcriptLabel, { color: colors.subtext }]}>
              {transcript ? 'YOUR ANSWER' : submitting ? 'TRANSCRIBING' : 'YOUR ANSWER'}
            </ThemedText>
          </View>
          {transcript ? (
            <ThemedText style={[styles.transcriptText, { color: colors.oppositeColor }]}>
              &quot;{transcript}&quot;
            </ThemedText>
          ) : (
            <ThemedText style={[styles.transcriptText, { color: colors.muted }]}>
              {submitting
                ? 'Transcribing your answer…'
                : 'Your answer appears here once you move to the next question.'}
            </ThemedText>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

function PanelSeat({
  member,
  active,
  colors,
}: {
  member: Panelist
  active: boolean
  colors: any
}) {
  return (
    <View style={styles.seat}>
      <View style={styles.seatAvatarWrap}>
        <Image
          source={{ uri: member.avatar }}
          style={[
            styles.seatAvatar,
            active && { borderWidth: 2, borderColor: colors.tint },
          ]}
        />
        {active && <View style={[styles.seatDot, { borderColor: colors.card }]} />}
      </View>
      <ThemedText style={[styles.seatName, { color: colors.oppositeColor }]} numberOfLines={1}>
        {member.name.split(' ')[0]}
      </ThemedText>
      <ThemedText style={[styles.seatRole, { color: colors.muted }]} numberOfLines={1}>
        {member.role}
      </ThemedText>
    </View>
  )
}

const WAVE = [14, 22, 30, 18, 26, 14, 30, 20, 24, 16, 28, 22, 14, 20, 16, 12, 18, 14, 22, 16, 12, 18, 14, 16, 20, 14, 10, 12, 10, 14, 12, 10]

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1 },
  avatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10 },
  brand: { fontWeight: '700', fontSize: 17 },

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
  questionText: { fontSize: 15, lineHeight: 22, marginBottom: 16 },

  player: { borderRadius: 12, padding: 14 },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  playBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  playerLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  playerLabel: { fontSize: 12, fontWeight: '600' },
  playerTime: { fontSize: 12 },
  progressTrack: { height: 3, borderRadius: 2, overflow: 'hidden' },
  progressFill: { width: '40%', height: '100%' },
  waveform: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 14, paddingLeft: 52 },

  aiCard: { borderRadius: 14, padding: 22, alignItems: 'center', marginTop: 16, marginBottom: 16 },
  aiAvatarWrap: { width: 110, height: 110, marginBottom: 12 },
  aiAvatar: { width: 110, height: 110, borderRadius: 55 },
  statusDot: {
    position: 'absolute', right: 4, bottom: 4,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: '#22C55E', borderWidth: 3,
  },
  panelRow: { flexDirection: 'row', justifyContent: 'center', gap: 14, marginBottom: 14 },
  seat: { alignItems: 'center', width: 68 },
  seatAvatarWrap: { width: 60, height: 60, marginBottom: 6 },
  seatAvatar: { width: 60, height: 60, borderRadius: 30 },
  seatDot: {
    position: 'absolute', right: 0, bottom: 0,
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#22C55E', borderWidth: 2,
  },
  seatName: { fontSize: 11, fontWeight: '700' },
  seatRole: { fontSize: 10, marginTop: 1 },

  aiLabel: { fontWeight: '600', fontSize: 14, marginBottom: 8 },
  miniBars: { flexDirection: 'row', alignItems: 'center', gap: 3 },

  stopBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 999, height: 52, marginBottom: 16,
  },
  stopBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  endEarly: { alignItems: 'center', paddingVertical: 4, marginBottom: 16, marginTop: -6 },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 10, padding: 12, marginBottom: 12 },
  followUpPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, marginBottom: 10 },
  followUpText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },

  transcriptCard: { borderRadius: 12, padding: 16 },
  transcriptHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  transcriptLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  transcriptText: { fontSize: 14, lineHeight: 22 },
  caret: { fontWeight: '700' },
})
