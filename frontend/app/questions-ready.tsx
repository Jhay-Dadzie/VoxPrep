import { ThemedText } from '@/components/themed-text'
import { Colors } from '@/constants/theme'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { useMode } from '@/hooks/mode-context'
import { getPreparedSession } from '@/lib/prepared-session'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { router, useLocalSearchParams } from 'expo-router'
import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

export default function QuestionsReady() {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const { copy } = useMode()
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>()

  const prepared = sessionId ? getPreparedSession(sessionId) : null
  const maxQuestions = prepared?.maxQuestions ?? 15
  const roleTitle = prepared?.jobDescription.title

  return (
    <View style={styles.root}>
      <Pressable style={styles.backdrop} onPress={() => router.back()} />

      <View style={[styles.sheet, { backgroundColor: colors.card }]}>
        <View style={[styles.handle, { backgroundColor: colors.border }]} />

        <ThemedText style={[styles.title, { color: colors.oppositeColor }]}>
          Your {copy.sessionNoun} is Ready
        </ThemedText>
        {/* No question count to promise: the interviewer writes each question
            from what you have just said, and stops when it has heard enough. */}
        <ThemedText style={[styles.sub, { color: colors.subtext }]}>
          {roleTitle
            ? `You'll be interviewed on ${roleTitle}. Questions come one at a time — up to ${maxQuestions} — and follow on from your answers.`
            : `Questions come one at a time — up to ${maxQuestions} — and follow on from your answers.`}
        </ThemedText>

        <Pressable
          style={styles.circleWrap}
          onPress={() => router.replace({ pathname: '/countdown', params: { sessionId } })}
          disabled={!sessionId}
        >
          <View style={styles.shadowHost}>
            <LinearGradient
              colors={[colors.tint, '#7A4CF0']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.circle}
            >
              <Ionicons name="mic" size={40} color="#fff" />
              <ThemedText style={styles.circleText}>START{'\n'}{copy.sessionNoun.toUpperCase()}</ThemedText>
            </LinearGradient>
          </View>
        </Pressable>

        <View style={styles.footer}>
          <Ionicons name="information-circle-outline" size={14} color={colors.muted} />
          <ThemedText style={[styles.footerText, { color: colors.muted }]}>
            Tap the circle when you&apos;re in a quiet place and ready to speak.
          </ThemedText>
        </View>
      </View>
    </View>
  )
}

const CIRCLE = 200

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000000AA' },

  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 32,
    alignItems: 'center',
  },
  handle: { width: 44, height: 4, borderRadius: 2, marginBottom: 22 },

  title: { fontSize: 20, fontWeight: '700', textAlign: 'center', marginBottom: 10 },
  sub: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: 32, paddingHorizontal: 12 },

  circleWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: 26, marginTop: 8 },
  shadowHost: {
    width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2,
    shadowColor: '#4F6BFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 38,
    elevation: 24,
  },
  circle: {
    width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2,
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  circleText: { color: '#fff', fontWeight: '800', textAlign: 'center', fontSize: 17, letterSpacing: 1 },

  footer: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16 },
  footerText: { fontSize: 12, textAlign: 'center', flex: 1 },
})
