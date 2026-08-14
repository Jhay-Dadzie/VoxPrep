import { StyleSheet, View, ScrollView, Image, Pressable, ActivityIndicator } from 'react-native'
import React from 'react'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ThemedText } from '@/components/themed-text'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { Colors } from '@/constants/theme'
import { useAuth } from '@/hooks/auth-context'
import { useRecentSessions } from '@/hooks/use-history'
import { HistorySummary } from '@/types/history'
import { formatDuration, formatRelative, formatScore, scoreBand } from '@/lib/format'

const AVATAR = 'https://i.pravatar.cc/100?img=12'

/** Recent sessions shown inline; the rest live behind "View All". */
const DASHBOARD_SESSION_COUNT = 7

export default function Dashboard() {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const { user } = useAuth()
  const { sessions, total, averageScore, isLoading, error, refresh, hasHistory } =
    useRecentSessions(DASHBOARD_SESSION_COUNT)

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

      <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: 20, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        {hasHistory && (
          <>
            <ThemedText style={[styles.welcomeTag, { color: colors.muted }]}>WELCOME BACK,</ThemedText>
            <ThemedText style={[styles.welcomeName, { color: colors.oppositeColor }]}>
              {user?.full_name || 'there'}
            </ThemedText>
          </>
        )}

        <LinearGradient
          colors={[colors.tint, '#7A4CF0']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[styles.hero, !hasHistory && { padding: 22 }]}
        >
          {!hasHistory ? (
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

        {error && (
          <View style={[styles.errorCard, { backgroundColor: colors.dangerBg }]}>
            <Ionicons name="alert-circle" size={16} color={colors.danger} />
            <ThemedText style={{ color: colors.danger, fontSize: 13, flex: 1 }}>{error}</ThemedText>
            <Pressable onPress={refresh} hitSlop={8}>
              <ThemedText style={{ color: colors.danger, fontWeight: '700', fontSize: 13 }}>
                Retry
              </ThemedText>
            </Pressable>
          </View>
        )}

        {isLoading ? (
          <ActivityIndicator style={{ marginTop: 32 }} color={colors.tint} />
        ) : !hasHistory ? (
          <>
            <View style={[styles.emptyCard, { backgroundColor: colors.card }]}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.brandSoft }]}>
                <Ionicons name="mic" size={22} color={colors.tint} />
              </View>
              <ThemedText style={[styles.emptyTitle, { color: colors.oppositeColor }]}>No interview history yet</ThemedText>
              <ThemedText style={[styles.emptyBody, { color: colors.subtext }]}>
                Your practice sessions and AI insights will appear here once you start. Set up your profile and get ready to talk.
              </ThemedText>
            </View>

            <View style={[styles.tipCard, { backgroundColor: colors.brandSoft, borderColor: colors.border }]}>
              <View style={styles.tipHeader}>
                <Ionicons name="bulb" size={16} color={colors.warning} />
                <ThemedText style={[styles.tipTitle, { color: colors.oppositeColor }]}>Pro Tip</ThemedText>
              </View>
              <ThemedText style={[styles.tipBody, { color: colors.subtext }]}>
                Practice with a specific job description. Paste it before your session to get tailored questions directly relevant to your target role.
              </ThemedText>
            </View>
          </>
        ) : (
          <>
            <View style={styles.statsRow}>
              <StatCard icon="time-outline" value={`${total}`} label="Sessions Reviewed" colors={colors} />
              <StatCard
                icon="stats-chart"
                value={formatScore(averageScore)}
                label="Avg Score"
                colors={colors}
              />
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
              <Pressable onPress={() => router.push('/history')} hitSlop={8}>
                <ThemedText style={{ color: colors.tint, fontWeight: '600', fontSize: 13 }}>View All</ThemedText>
              </Pressable>
            </View>

            {sessions.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                colors={colors}
                onPress={() =>
                  router.push({ pathname: '/history/[id]', params: { id: session.id } })
                }
              />
            ))}

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

function SessionRow({
  session,
  colors,
  onPress,
}: {
  session: HistorySummary
  colors: any
  onPress: () => void
}) {
  const score = session.overall_score
  const band = scoreBand(score)
  const bg =
    band.tone === 'success'
      ? colors.successBg
      : band.tone === 'warning'
        ? colors.warningBg
        : band.tone === 'danger'
          ? colors.dangerBg
          : colors.inputBg
  const fg =
    band.tone === 'success'
      ? colors.success
      : band.tone === 'warning'
        ? colors.warning
        : band.tone === 'danger'
          ? colors.danger
          : colors.subtext

  const title = session.session_title || session.job_title || 'Untitled session'
  const meta = [formatRelative(session.started_at), formatDuration(session.duration_seconds)]
    .filter((part) => part !== '--')
    .join(' • ')

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.sessionRow,
        { backgroundColor: colors.card, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View style={[styles.sessionIcon, { backgroundColor: colors.brandSoft }]}>
        <Ionicons
          name={session.status === 'paused' ? 'pause' : 'mic'}
          size={18}
          color={colors.subtext}
        />
      </View>
      <View style={{ flex: 1 }}>
        <ThemedText style={{ color: colors.oppositeColor, fontWeight: '600' }} numberOfLines={1}>
          {title}
        </ThemedText>
        <ThemedText style={{ color: colors.subtext, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
          {meta || 'No timing recorded'}
        </ThemedText>
      </View>
      <View style={[styles.scorePill, { backgroundColor: bg }]}>
        <ThemedText style={{ color: fg, fontWeight: '700', fontSize: 13 }}>
          {formatScore(score)}
        </ThemedText>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1 },
  avatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
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

  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  emptyCard: { borderRadius: 12, padding: 32, alignItems: 'center', marginBottom: 16 },
  emptyIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  emptyTitle: { fontWeight: '700', fontSize: 17, marginBottom: 8 },
  emptyBody: { fontSize: 13, lineHeight: 19, textAlign: 'center' },

  tipCard: { borderRadius: 12, padding: 16, borderWidth: 1 },
  tipHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  tipTitle: { fontWeight: '700' },
  tipBody: { fontSize: 13, lineHeight: 19 },
})
