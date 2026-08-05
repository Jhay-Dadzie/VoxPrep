import React from 'react'
import { StyleSheet, View, ScrollView, Pressable } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ThemedText } from '@/components/themed-text'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { Colors } from '@/constants/theme'

type Tone = 'success' | 'warning'
type Question = {
  n: string
  title: string
  meta: string
  score: string
  badge: string
  tone: Tone
  insight: string
}

const QUESTIONS: Question[] = [
  {
    n: '01',
    title: '"Tell me about yourself and your background."',
    meta: 'Behavioral Question • 2m 15s',
    score: '9/10',
    badge: 'Exceptional',
    tone: 'success',
    insight:
      'Your narrative arc was very strong. You connected your past experiences to the current role requirements effectively. Consider shortening the early educational part to spend more time on recent wins.',
  },
  {
    n: '02',
    title: '"How do you handle conflict within a team environment?"',
    meta: 'Situational Question • 3m 40s',
    score: '6/10',
    badge: 'Needs Work',
    tone: 'warning',
    insight:
      'While your example was relevant, the resolution felt a bit vague. Try using the STAR method (Situation, Task, Action, Result) more strictly to quantify the positive outcome of your intervention.',
  },
  {
    n: '03',
    title: '"Where do you see yourself in five years?"',
    meta: 'Career Goals • 1m 50s',
    score: '8.5/10',
    badge: 'Strong',
    tone: 'success',
    insight:
      'Great alignment with company values! Your response showed ambition while remaining realistic. Adding a specific skill you hope to master would make this answer a perfect 10.',
  },
]

export default function Results() {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.card }} edges={['top']}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <ThemedText style={[styles.headerTitle, { color: colors.tint }]}>Results</ThemedText>
      </View>

      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        <ThemedText style={[styles.heroTitle, { color: colors.tint }]}>
          Interview Session{'\n'}Complete!
        </ThemedText>
        <ThemedText style={[styles.heroSub, { color: colors.subtext }]}>
          You&apos;ve successfully finished your mock interview with our AI recruiter.
        </ThemedText>

        <View style={[styles.scoreCard, { backgroundColor: colors.card }]}>
          <ThemedText style={[styles.scoreTag, { color: colors.subtext }]}>OVERALL PERFORMANCE</ThemedText>
          <View style={[styles.ring, { borderColor: colors.tint }]}>
            <ThemedText style={[styles.ringNum, { color: colors.tint }]}>72%</ThemedText>
          </View>
          <View style={[styles.goodPill, { backgroundColor: colors.successBg }]}>
            <ThemedText style={[styles.goodPillText, { color: colors.success }]}>Good Job!</ThemedText>
          </View>
        </View>

        <View style={[styles.metricsCard, { backgroundColor: colors.card }]}>
          <ThemedText style={[styles.metricsTitle, { color: colors.oppositeColor }]}>Performance Metrics</ThemedText>

          <Metric label="Clarity" value="8/10" pct={0.8} color={colors.tint} track={colors.border} sub={colors.subtext} text={colors.oppositeColor} />
          <Metric label="Quality" value="7/10" pct={0.7} color="#7A4CF0" track={colors.border} sub={colors.subtext} text={colors.oppositeColor} />
          <Metric label="Confidence" value="8.5/10" pct={0.85} color={colors.success} track={colors.border} sub={colors.subtext} text={colors.oppositeColor} />

          <View style={styles.actionsRow}>
            <Pressable style={[styles.btnPrimary, { backgroundColor: colors.tint }]} onPress={() => router.replace('/(tabs)/dashboard')}>
              <ThemedText style={styles.btnPrimaryText}>Save Results</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.btnOutline, { borderColor: colors.tint }]}
              onPress={() => router.replace('/interview-session')}
            >
              <ThemedText style={[styles.btnOutlineText, { color: colors.tint }]}>Retake Session</ThemedText>
            </Pressable>
          </View>
        </View>

        <View style={styles.sectionHead}>
          <ThemedText style={[styles.sectionTitle, { color: colors.oppositeColor }]}>
            Question-by-Question{'\n'}Analysis
          </ThemedText>
          <View style={styles.historyLink}>
            <ThemedText style={[styles.historyText, { color: colors.tint }]}>View{'\n'}History</ThemedText>
            <Ionicons name="time-outline" size={16} color={colors.tint} />
          </View>
        </View>

        {QUESTIONS.map((q) => (
          <QuestionCard key={q.n} q={q} colors={colors} />
        ))}

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
    </SafeAreaView>
  )
}

function Metric({
  label, value, pct, color, track, sub, text,
}: { label: string; value: string; pct: number; color: string; track: string; sub: string; text: string }) {
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

function QuestionCard({ q, colors }: { q: Question; colors: any }) {
  const tone = q.tone === 'success' ? colors.success : colors.warning
  const toneBg = q.tone === 'success' ? colors.successBg : colors.warningBg
  const accent = q.tone === 'success' ? colors.success : '#7A4CF0'
  return (
    <View style={[styles.qCard, { backgroundColor: colors.card }]}>
      <View style={styles.qTop}>
        <View style={[styles.qNum, { backgroundColor: colors.brandSoft }]}>
          <ThemedText style={[styles.qNumText, { color: colors.subtext }]}>{q.n}</ThemedText>
        </View>
        <View style={{ flex: 1 }}>
          <ThemedText style={[styles.qTitle, { color: colors.oppositeColor }]}>{q.title}</ThemedText>
          <ThemedText style={[styles.qMeta, { color: colors.subtext }]}>{q.meta}</ThemedText>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <ThemedText style={[styles.qScore, { color: tone }]}>{q.score}</ThemedText>
          <View style={[styles.qBadge, { backgroundColor: toneBg }]}>
            <ThemedText style={[styles.qBadgeText, { color: tone }]}>{q.badge}</ThemedText>
          </View>
        </View>
      </View>

      <View style={[styles.insightWrap, { backgroundColor: colors.inputBg }]}>
        <View style={[styles.insightAccent, { backgroundColor: accent }]} />
        <View style={styles.insightInner}>
          <View style={styles.insightHeader}>
            <Ionicons name="sparkles" size={14} color={accent} />
            <ThemedText style={[styles.insightTag, { color: accent }]}>AI INSIGHT</ThemedText>
          </View>
          <ThemedText style={[styles.insightText, { color: colors.oppositeColor }]}>{q.insight}</ThemedText>
        </View>
      </View>
    </View>
  )
}

const RING = 150

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
  headerTitle: { fontSize: 16, fontWeight: '700' },

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

  actionsRow: { flexDirection: 'row', gap: 12, marginTop: 10 },
  btnPrimary: { flex: 1, borderRadius: 999, paddingVertical: 12, alignItems: 'center' },
  btnPrimaryText: { color: '#fff', fontWeight: '700' },
  btnOutline: { flex: 1, borderRadius: 999, paddingVertical: 12, alignItems: 'center', borderWidth: 1 },
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
  qMeta: { fontSize: 12 },
  qScore: { fontWeight: '800', fontSize: 14, marginBottom: 4 },
  qBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  qBadgeText: { fontSize: 11, fontWeight: '700' },

  insightWrap: { borderRadius: 10, marginTop: 12, overflow: 'hidden', flexDirection: 'row' },
  insightAccent: { width: 4 },
  insightInner: { flex: 1, padding: 12 },
  insightHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  insightTag: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  insightText: { fontSize: 13, lineHeight: 19 },

  unlockCard: { borderRadius: 14, padding: 16, marginTop: 8, flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  unlockIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#ffffff30', alignItems: 'center', justifyContent: 'center' },
  unlockTitle: { color: '#fff', fontWeight: '800', fontSize: 16, marginBottom: 4 },
  unlockSub: { color: '#ffffffd0', fontSize: 13, lineHeight: 18, marginBottom: 12 },
  goPro: { alignSelf: 'flex-start', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999 },
  goProText: { fontWeight: '700' },
})
