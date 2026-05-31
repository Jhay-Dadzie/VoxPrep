import { StyleSheet, View, ScrollView, Image, Pressable } from 'react-native'
import React, { useState } from 'react'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ThemedText } from '@/components/themed-text'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { Colors } from '@/constants/theme'

const AVATAR = 'https://i.pravatar.cc/100?img=12'

export default function Dashboard() {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const [empty, setEmpty] = useState(false)

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Image source={{ uri: AVATAR }} style={styles.avatar} />
        <ThemedText style={[styles.brand, { color: colors.tint }]}>VoxPrep</ThemedText>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => setEmpty(!empty)} hitSlop={10}>
          <Ionicons name="notifications-outline" size={22} color={colors.oppositeColor} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        {!empty && (
          <>
            <ThemedText style={[styles.welcomeTag, { color: colors.muted }]}>WELCOME BACK,</ThemedText>
            <ThemedText style={[styles.welcomeName, { color: colors.oppositeColor }]}>Alex Reynolds</ThemedText>
          </>
        )}

        <LinearGradient
          colors={[colors.tint, '#7A4CF0']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[styles.hero, empty && { padding: 22 }]}
        >
          {empty ? (
            <>
              <ThemedText style={styles.heroTitleLg}>Welcome to VoxPrep!</ThemedText>
              <ThemedText style={styles.heroSubLg}>Ready to land your dream job? Start practicing with AI-driven, realistic interview scenarios.</ThemedText>
              <Pressable style={[styles.heroBtn, { backgroundColor: colors.card }]} onPress={() => router.push('/(tabs)/practice')}>
                <ThemedText style={[styles.heroBtnText, { color: colors.tint }]}>Start Your First Session</ThemedText>
                <Ionicons name="play" size={14} color={colors.tint} />
              </Pressable>
            </>
          ) : (
            <>
              <ThemedText style={styles.heroTitle}>Ready for your next interview?</ThemedText>
              <Pressable style={[styles.heroBtn, { backgroundColor: colors.card }]} onPress={() => router.push('/(tabs)/practice')}>
                <ThemedText style={[styles.heroBtnText, { color: colors.tint }]}>Start Practice Session</ThemedText>
                <Ionicons name="play-circle" size={18} color={colors.tint} />
              </Pressable>
            </>
          )}
        </LinearGradient>

        {empty ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card }]}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.brandSoft }]}>
              <Ionicons name="mic" size={22} color={colors.tint} />
            </View>
            <ThemedText style={[styles.emptyTitle, { color: colors.oppositeColor }]}>No interview history yet</ThemedText>
            <ThemedText style={[styles.emptyBody, { color: colors.subtext }]}>
              Your practice sessions and AI insights will appear here once you start. Set up your profile and get ready to talk.
            </ThemedText>
          </View>
        ) : (
          <>
            <View style={styles.statsRow}>
              <StatCard icon="time-outline" value="24" label="Sessions Completed" colors={colors} />
              <StatCard icon="stats-chart" value="82%" label="Avg Score" colors={colors} />
            </View>

            <View style={[styles.nextCard, { backgroundColor: colors.card }]}>
              <View style={[styles.nextIcon, { backgroundColor: colors.brandSoft }]}>
                <Ionicons name="calendar" size={18} color={colors.tint} />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={{ color: colors.subtext, fontSize: 13 }}>Next Interview</ThemedText>
                <ThemedText style={{ color: colors.oppositeColor, fontWeight: '600', marginTop: 2 }}>Oct 12 • Google</ThemedText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </View>

            <View style={styles.sectionHead}>
              <ThemedText style={[styles.sectionTitle, { color: colors.oppositeColor }]}>Recent Sessions</ThemedText>
              <ThemedText style={{ color: colors.tint, fontWeight: '600', fontSize: 13 }}>View All</ThemedText>
            </View>

            <SessionRow icon="code-slash" title="Software Engineer" meta="2 days ago • 15 mins" score={92} tone="success" colors={colors} />
            <SessionRow icon="bar-chart" title="Product Manager" meta="5 days ago • 22 mins" score={74} tone="warning" colors={colors} />
            <SessionRow icon="person" title="Behavioral Prep" meta="1 week ago • 10 mins" score={48} tone="danger" colors={colors} />

            <View style={[styles.insights, { backgroundColor: '#0B1220' }]}>
              <ThemedText style={styles.insightsTag}>AI INSIGHTS</ThemedText>
              <ThemedText style={styles.insightsBody}>
                &quot;You&apos;ve shown 15% improvement in technical articulation this week. Keep focusing on STAR method examples.&quot;
              </ThemedText>
              <Ionicons name="sparkles" size={48} color="#ffffff20" style={styles.insightsSparkle} />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function StatCard({ icon, value, label, colors }: any) {
  return (
    <View style={[styles.statCard, { backgroundColor: colors.card }]}>
      <Ionicons name={icon} size={18} color={colors.tint} />
      <ThemedText style={{ color: colors.oppositeColor, fontSize: 26, fontWeight: '700', marginTop: 8 }}>{value}</ThemedText>
      <ThemedText style={{ color: colors.subtext, fontSize: 13, marginTop: 2 }}>{label}</ThemedText>
    </View>
  )
}

function SessionRow({ icon, title, meta, score, tone, colors }: any) {
  const bg = tone === 'success' ? colors.successBg : tone === 'warning' ? colors.warningBg : colors.dangerBg
  const fg = tone === 'success' ? colors.success : tone === 'warning' ? colors.warning : colors.danger
  return (
    <View style={[styles.sessionRow, { backgroundColor: colors.card }]}>
      <View style={[styles.sessionIcon, { backgroundColor: colors.brandSoft }]}>
        <Ionicons name={icon} size={18} color={colors.subtext} />
      </View>
      <View style={{ flex: 1 }}>
        <ThemedText style={{ color: colors.oppositeColor, fontWeight: '600' }}>{title}</ThemedText>
        <ThemedText style={{ color: colors.subtext, fontSize: 12, marginTop: 2 }}>{meta}</ThemedText>
      </View>
      <View style={[styles.scorePill, { backgroundColor: bg }]}>
        <ThemedText style={{ color: fg, fontWeight: '700', fontSize: 13 }}>{score}%</ThemedText>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1 },
  avatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10 },
  brand: { fontWeight: '700', fontSize: 17 },

  welcomeTag: { fontSize: 11, fontWeight: '600', letterSpacing: 1 },
  welcomeName: { fontSize: 22, fontWeight: '500', marginTop: 2, marginBottom: 14 },

  hero: { borderRadius: 16, padding: 18, marginBottom: 16 },
  heroTitle: { color: '#fff', fontSize: 16, marginBottom: 14 },
  heroTitleLg: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 8 },
  heroSubLg: { color: '#ffffffd0', fontSize: 14, lineHeight: 20, marginBottom: 16 },
  heroBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingHorizontal: 18, paddingVertical: 12, borderRadius: 999 },
  heroBtnText: { fontWeight: '700' },

  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  statCard: { flex: 1, borderRadius: 12, padding: 16 },

  nextCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 14, gap: 12, marginBottom: 18 },
  nextIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },

  sessionRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 14, marginBottom: 8 },
  sessionIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  scorePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },

  insights: { borderRadius: 12, padding: 18, marginTop: 14, overflow: 'hidden' },
  insightsTag: { color: '#9CB3FF', letterSpacing: 1, fontSize: 11, fontWeight: '700', marginBottom: 8 },
  insightsBody: { color: '#fff', fontSize: 14, lineHeight: 20 },
  insightsSparkle: { position: 'absolute', right: 12, bottom: 12 },

  emptyCard: { borderRadius: 12, padding: 32, alignItems: 'center', marginBottom: 16 },
  emptyIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  emptyTitle: { fontWeight: '700', fontSize: 17, marginBottom: 8 },
  emptyBody: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
})
