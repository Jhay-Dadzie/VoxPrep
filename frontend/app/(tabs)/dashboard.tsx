import { StyleSheet, View, ScrollView, Image, Pressable, ActivityIndicator, RefreshControl } from 'react-native'
import React, { useCallback, useEffect, useState } from 'react'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { fetchOverview, type DashboardOverview, type RecentSession } from '@/services/api'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ThemedText } from '@/components/themed-text'
import { ModeBadge } from '@/components/mode-badge'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { useMode } from '@/hooks/mode-context'
import { Colors } from '@/constants/theme'

const AVATAR = 'https://i.pravatar.cc/100?img=12'

export default function Dashboard() {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const { copy, mode, modeId } = useMode()
  const [overview, setOverview] = useState<DashboardOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setOverview(await fetchOverview(modeId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your dashboard.')
    } finally {
      setLoading(false)
    }
  }, [modeId])

  // Switching mode must discard the previous mode's numbers immediately.
  // Leaving them on screen while the new ones load would show, say, viva
  // scores under a Job Interview heading.
  useEffect(() => {
    setOverview(null)
    setLoading(true)
  }, [modeId])

  // Refetch on focus: finishing a session should be reflected the moment the
  // user comes back here, and this tab stays mounted.
  useFocusEffect(
    useCallback(() => {
      load()
    }, [load]),
  )

  // Show the welcome state until we know otherwise, so a slow network never
  // flashes fabricated numbers.
  const empty = overview?.isNewUser ?? true

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.card }} edges={['top']}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Image source={{ uri: AVATAR }} style={styles.avatar} />
        <ThemedText style={[styles.brand, { color: colors.tint }]}>VoxPrep</ThemedText>
        <View style={{ flex: 1 }} />
        <ModeBadge />
        {/* The empty state is now derived from real data, so the old bell-tap
            toggle that faked it has gone. Refresh is genuinely useful here. */}
        <Pressable onPress={load} hitSlop={10} accessibilityLabel="Refresh">
          {loading ? (
            <ActivityIndicator size="small" color={colors.tint} />
          ) : (
            <Ionicons name="refresh-outline" size={22} color={colors.oppositeColor} />
          )}
        </Pressable>
      </View>

      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.tint} />}
      >
        {error && (
          <View style={[styles.errorBox, { backgroundColor: colors.dangerBg }]}>
            <Ionicons name="alert-circle" size={15} color={colors.danger} />
            <ThemedText style={{ color: colors.danger, fontSize: 12, flex: 1 }}>{error}</ThemedText>
          </View>
        )}

        {!empty && (
          <>
            <ThemedText style={[styles.welcomeTag, { color: colors.muted }]}>WELCOME BACK,</ThemedText>
            <ThemedText style={[styles.welcomeName, { color: colors.oppositeColor }]}>Alex Reynolds</ThemedText>
            {overview?.lastInterviewDate && (
              <ThemedText style={{ color: colors.subtext, fontSize: 12, marginTop: 2 }}>
                Last {copy.sessionNoun} {relativeTime(overview.lastInterviewDate).toLowerCase()}
              </ThemedText>
            )}
          </>
        )}

        <LinearGradient
          colors={[colors.tint, '#7A4CF0']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[styles.hero, empty && { padding: 22 }]}
        >
          {empty ? (
            <>
              <ThemedText style={styles.heroTitleLg}>{copy.welcomeTitle}</ThemedText>
              <ThemedText style={styles.heroSubLg}>{copy.welcomeSubtitle}</ThemedText>
              <Pressable style={[styles.heroBtn, { backgroundColor: colors.card }]} onPress={() => router.push('/(tabs)/practice')}>
                <ThemedText style={[styles.heroBtnText, { color: colors.tint }]}>{copy.firstSessionCta}</ThemedText>
                <Ionicons name="play" size={14} color={colors.tint} />
              </Pressable>
            </>
          ) : (
            <>
              <ThemedText style={styles.heroTitle}>{copy.returningPrompt}</ThemedText>
              <Pressable
                style={[styles.heroBtn, { backgroundColor: colors.card }]}
                onPress={() => router.push('/(tabs)/practice')}
              >
                <ThemedText style={[styles.heroBtnText, { color: colors.tint }]}>{copy.practiceCta}</ThemedText>
                <Ionicons name="play-circle" size={18} color={colors.tint} />
              </Pressable>
            </>
          )}
        </LinearGradient>

        {empty ? (
          <>
            <View style={[styles.emptyCard, { backgroundColor: colors.card }]}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.brandSoft }]}>
                <Ionicons name="mic" size={22} color={colors.tint} />
              </View>
              <ThemedText style={[styles.emptyTitle, { color: colors.oppositeColor }]}>{copy.emptyHistory}</ThemedText>
              <ThemedText style={[styles.emptyBody, { color: colors.subtext }]}>
                Your practice sessions and AI insights will appear here once you start. Set up your profile and get ready to talk.
              </ThemedText>
            </View>

            <View style={[styles.tipCard, { backgroundColor: colors.brandSoft, borderColor: colors.border }]}>
              <View style={styles.tipHeader}>
                <Ionicons name="bulb" size={16} color={colors.warning} />
                <ThemedText style={[styles.tipTitle, { color: colors.oppositeColor }]}>Pro Tip</ThemedText>
              </View>
              <ThemedText style={[styles.tipBody, { color: colors.subtext }]}>{copy.proTip}</ThemedText>
            </View>
          </>
        ) : (
          <>
            <View style={styles.statsRow}>
              <StatCard
                icon="time-outline"
                value={String(overview?.completedSessions ?? 0)}
                label={copy.sessionsCompletedLabel}
                colors={colors}
              />
              <StatCard
                icon="stats-chart"
                value={overview?.averageScore != null ? `${Math.round(overview.averageScore)}%` : '—'}
                label="Avg Score"
                colors={colors}
              />
            </View>

            {/* States plainly that these numbers describe one mode only. */}
            <View style={[styles.scopeRow, { backgroundColor: colors.card }]}>
              <Ionicons name={mode.icon as any} size={14} color={colors.tint} />
              <ThemedText style={{ color: colors.subtext, fontSize: 12, flex: 1 }}>
                Showing your {mode.label} history only
              </ThemedText>
              {overview?.bestScore != null && (
                <ThemedText style={{ color: colors.success, fontSize: 12, fontWeight: '700' }}>
                  Best {Math.round(overview.bestScore)}%
                </ThemedText>
              )}
            </View>

            {overview && overview.history.length >= 2 && (
              <TrendCard history={overview.history} colors={colors} copy={copy} />
            )}

            <View style={styles.sectionHead}>
              <ThemedText style={[styles.sectionTitle, { color: colors.oppositeColor }]}>{copy.recentSessionsLabel}</ThemedText>
              <Pressable onPress={() => router.push('/(tabs)/progress')}>
                <ThemedText style={{ color: colors.tint, fontWeight: '600', fontSize: 13 }}>View All</ThemedText>
              </Pressable>
            </View>

            {overview?.recent.slice(0, 5).map((s) => (
              <RealSessionRow key={s.id} session={s} colors={colors} />
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

/**
 * One real session from history.
 *
 * A session with no score yet shows a dash rather than a zero — an unscored
 * session and a session scored zero mean very different things.
 */
function RealSessionRow({ session, colors }: { session: RecentSession; colors: any }) {
  const score = session.score
  const tone =
    score == null ? colors.muted : score >= 75 ? colors.success : score >= 50 ? colors.warning : colors.danger
  const toneBg =
    score == null ? colors.brandSoft : score >= 75 ? colors.successBg : score >= 50 ? colors.warningBg : colors.dangerBg

  return (
    <View style={[styles.sessionRow, { backgroundColor: colors.card }]}>
      <View style={[styles.sessionIcon, { backgroundColor: colors.brandSoft }]}>
        <Ionicons
          name={session.status === 'completed' ? 'checkmark-done' : 'ellipsis-horizontal'}
          size={18}
          color={colors.tint}
        />
      </View>
      <View style={{ flex: 1 }}>
        <ThemedText style={{ color: colors.oppositeColor, fontWeight: '600' }} numberOfLines={1}>
          {session.title}
        </ThemedText>
        <ThemedText style={{ color: colors.subtext, fontSize: 12, marginTop: 2 }}>
          {relativeTime(session.completedAt ?? session.startedAt)}
          {' · '}
          {session.questionsAnswered}/{session.totalQuestions} answered
        </ThemedText>
      </View>
      <View style={[styles.scorePill, { backgroundColor: toneBg }]}>
        <ThemedText style={{ color: tone, fontWeight: '800', fontSize: 13 }}>
          {score == null ? '—' : `${Math.round(score)}%`}
        </ThemedText>
      </View>
    </View>
  )
}

/** Score trend, drawn with plain views — no charting dependency. */
function TrendCard({ history, colors, copy }: { history: DashboardOverview['history']; colors: any; copy: any }) {
  const scores = history.map((h) => h.score ?? 0)
  const first = scores[0]
  const latest = scores[scores.length - 1]
  const delta = Math.round(latest - first)
  const up = delta >= 0

  return (
    <View style={[styles.trendCard, { backgroundColor: colors.card }]}>
      <View style={styles.trendHead}>
        <ThemedText style={{ color: colors.oppositeColor, fontWeight: '700', fontSize: 15 }}>
          Score trend
        </ThemedText>
        <View
          style={[styles.trendPill, { backgroundColor: up ? colors.successBg : colors.dangerBg }]}
        >
          <Ionicons
            name={up ? 'trending-up' : 'trending-down'}
            size={13}
            color={up ? colors.success : colors.danger}
          />
          <ThemedText style={{ color: up ? colors.success : colors.danger, fontSize: 12, fontWeight: '700' }}>
            {up ? '+' : ''}{delta}
          </ThemedText>
        </View>
      </View>
      <ThemedText style={{ color: colors.subtext, fontSize: 12, marginBottom: 12 }}>
        Last {scores.length} {copy.sessionNounPlural}
      </ThemedText>
      <View style={styles.trendPlot}>
        {scores.map((s, i) => (
          <View key={i} style={styles.trendSlot}>
            <View
              style={[
                styles.trendBar,
                {
                  height: `${Math.max(4, Math.min(100, s))}%`,
                  backgroundColor: i === scores.length - 1 ? colors.tint : colors.brandSoft,
                },
              ]}
            />
          </View>
        ))}
      </View>
    </View>
  )
}

/** "2 days ago" from a timestamp, or a dash when there is none. */
function relativeTime(iso: string | null): string {
  if (!iso) return 'Not started'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'

  const mins = Math.floor((Date.now() - then) / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  const weeks = Math.floor(days / 7)
  return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`
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

  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, padding: 12, marginBottom: 14 },

  scopeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, padding: 12, marginBottom: 16 },

  trendCard: { borderRadius: 14, padding: 16, marginBottom: 18 },
  trendHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  trendPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  trendPlot: { height: 90, flexDirection: 'row', alignItems: 'flex-end', gap: 5 },
  trendSlot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  trendBar: { width: '100%', borderRadius: 3, minHeight: 4 },

  insights: { borderRadius: 12, padding: 18, marginTop: 14, overflow: 'hidden' },
  insightsTag: { color: '#9CB3FF', letterSpacing: 1, fontSize: 11, fontWeight: '700', marginBottom: 8 },
  insightsBody: { color: '#fff', fontSize: 14, lineHeight: 20 },
  insightsSparkle: { position: 'absolute', right: 12, bottom: 12 },

  emptyCard: { borderRadius: 12, padding: 32, alignItems: 'center', marginBottom: 16 },
  emptyIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  emptyTitle: { fontWeight: '700', fontSize: 17, marginBottom: 8 },
  emptyBody: { fontSize: 13, lineHeight: 19, textAlign: 'center' },

  tipCard: { borderRadius: 12, padding: 16, borderWidth: 1 },
  tipHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  tipTitle: { fontWeight: '700' },
  tipBody: { fontSize: 13, lineHeight: 19 },
})
