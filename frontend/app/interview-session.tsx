import React, { useEffect, useRef, useState } from 'react'
import { StyleSheet, View, ScrollView, Image, Pressable } from 'react-native'
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
import { useColorScheme } from '@/hooks/use-color-scheme'
import { Colors } from '@/constants/theme'

const BAR_COUNT = 12

const RECORDER_OPTIONS = { ...RecordingPresets.LOW_QUALITY, isMeteringEnabled: true }

function meteringToHeight(db: number) {
  // expo-audio metering returns dBFS, typically -160 (silent) to 0 (peak).
  const clamped = Math.max(-60, Math.min(0, db ?? -60))
  const norm = (clamped + 60) / 60 // 0..1
  return 6 + norm * 36 // 6..42 px
}

const AVATAR = 'https://i.pravatar.cc/100?img=12'
const AI_AVATAR = 'https://i.pravatar.cc/200?img=47'

function pad(n: number) {
  return n.toString().padStart(2, '0')
}

export default function InterviewSession() {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const [seconds, setSeconds] = useState(332)
  const [bars, setBars] = useState<number[]>(Array(BAR_COUNT).fill(8))

  const onMeter = useRef((status: any) => {
    const m = status?.metering
    if (typeof m === 'number') {
      const next = meteringToHeight(m)
      setBars((prev) => [...prev.slice(1), next])
    }
  }).current
  const recorder = useAudioRecorder(RECORDER_OPTIONS, onMeter)
  const recorderState = useAudioRecorderState(recorder, 100)
  const startedRef = useRef(false)

  useEffect(() => {
    const i = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(i)
  }, [])

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    ;(async () => {
      try {
        const perm = await AudioModule.requestRecordingPermissionsAsync()
        if (!perm.granted) return
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })
        await recorder.prepareToRecordAsync()
        recorder.record()
      } catch {
        /* mic unavailable; bars stay flat */
      }
    })()
    return () => {
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.card }} edges={['top']}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Image source={{ uri: AVATAR }} style={styles.avatar} />
        <ThemedText style={[styles.brand, { color: colors.tint }]}>VoxPrep</ThemedText>
        <View style={{ flex: 1 }} />
        <Pressable hitSlop={10}>
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
            <ThemedText style={[styles.qVal, { color: colors.oppositeColor }]}>2 of 10</ThemedText>
          </View>
        </View>

        <Pressable style={[styles.replayBtn, { borderColor: colors.tint, backgroundColor: colors.card }]}>
          <Ionicons name="refresh" size={16} color={colors.tint} />
          <ThemedText style={{ color: colors.tint, fontWeight: '700' }}>Replay Question</ThemedText>
        </Pressable>

        <View style={[styles.questionCard, { backgroundColor: colors.card }]}>
          <LinearGradient
            colors={['#7A4CF0', colors.tint]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.questionAccent}
          />

          <View style={styles.questionInner}>
            <View style={[styles.tag, { backgroundColor: colors.brandSoft }]}>
              <ThemedText style={[styles.tagText, { color: colors.tint }]}>BEHAVIORAL QUESTION</ThemedText>
            </View>

            <ThemedText style={[styles.questionText, { color: colors.oppositeColor }]}>
              &quot;Tell me about a time you had to handle a difficult situation with a colleague. How did you resolve it?&quot;
            </ThemedText>

            <View style={[styles.player, { backgroundColor: colors.inputBg }]}>
              <View style={styles.playerRow}>
                <Pressable style={[styles.playBtn, { backgroundColor: colors.tint }]}>
                  <Ionicons name="play" size={18} color="#fff" />
                </Pressable>
                <View style={{ flex: 1 }}>
                  <View style={styles.playerLabels}>
                    <ThemedText style={[styles.playerLabel, { color: colors.subtext }]}>AI Question Voice</ThemedText>
                    <ThemedText style={[styles.playerTime, { color: colors.subtext }]}>0:12 / 0:18</ThemedText>
                  </View>
                  <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
                    <View style={[styles.progressFill, { backgroundColor: colors.tint }]} />
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

        <Pressable style={[styles.replayBtn, { borderColor: colors.tint, backgroundColor: colors.card, marginTop: 16 }]}>
          <Ionicons name="refresh" size={16} color={colors.tint} />
          <ThemedText style={{ color: colors.tint, fontWeight: '700' }}>Replay Question</ThemedText>
        </Pressable>

        <View style={[styles.aiCard, { backgroundColor: colors.card }]}>
          <View style={styles.aiAvatarWrap}>
            <Image source={{ uri: AI_AVATAR }} style={styles.aiAvatar} />
            <View style={[styles.statusDot, { borderColor: colors.card }]} />
          </View>
          <ThemedText style={[styles.aiLabel, { color: colors.oppositeColor }]}>
            {recorderState.isRecording ? 'AI Interviewer Listening...' : 'Microphone unavailable'}
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

        <Pressable
          style={[styles.stopBtn, { backgroundColor: colors.tint }]}
          onPress={async () => {
            try {
              await recorder.stop()
            } catch {
              /* noop */
            }
            router.replace('/(tabs)/results')
          }}
        >
          <Ionicons name="checkmark-circle" size={18} color="#fff" />
          <ThemedText style={styles.stopBtnText}>Stop &amp; Submit</ThemedText>
        </Pressable>

        <View style={[styles.transcriptCard, { backgroundColor: colors.inputBg }]}>
          <View style={styles.transcriptHeader}>
            <Ionicons name="reorder-three" size={16} color={colors.subtext} />
            <ThemedText style={[styles.transcriptLabel, { color: colors.subtext }]}>LIVE TRANSCRIPTION</ThemedText>
          </View>
          <ThemedText style={[styles.transcriptText, { color: colors.oppositeColor }]}>
            &quot;In my previous role as a Senior Project Manager, I often had to balance multiple high-priority tasks simultaneously. One specific instance involved...&quot;
            <ThemedText style={[styles.caret, { color: colors.tint }]}>|</ThemedText>
          </ThemedText>
        </View>
      </ScrollView>
    </SafeAreaView>
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
  aiLabel: { fontWeight: '600', fontSize: 14, marginBottom: 8 },
  miniBars: { flexDirection: 'row', alignItems: 'center', gap: 3 },

  stopBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 999, height: 52, marginBottom: 16,
  },
  stopBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  transcriptCard: { borderRadius: 12, padding: 16 },
  transcriptHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  transcriptLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  transcriptText: { fontSize: 14, lineHeight: 22 },
  caret: { fontWeight: '700' },
})
