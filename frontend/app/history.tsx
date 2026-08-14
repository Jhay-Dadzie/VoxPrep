import React from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ThemedText } from '@/components/themed-text'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { Colors } from '@/constants/theme'
import { useHistory } from '@/hooks/use-history'
import { HistorySort, HistorySummary } from '@/types/history'
import { formatDate, formatDuration, formatScore, scoreBand, scoreToPercent } from '@/lib/format'

const SORT_OPTIONS: { value: HistorySort; label: string }[] = [
  { value: 'recent', label: 'Recent' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'score_desc', label: 'Best' },
  { value: 'score_asc', label: 'Weakest' },
]

export default function History() {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const {
    items,
    pagination,
    isLoading,
    isRefreshing,
    isLoadingMore,
    error,
    searchInput,
    setSearchInput,
    sort,
    setSort,
    hasMore,
    refresh,
    loadMore,
    setArchived,
    remove,
  } = useHistory()

  const confirmDelete = (session: HistorySummary) => {
    Alert.alert(
      'Delete session?',
      'This permanently removes the session, its answers and its feedback. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            remove(session.id).catch(() => {
              // The hook restores the row and surfaces the message in the
              // error banner; nothing further to do here.
            })
          },
        },
      ]
    )
  }

  const toggleArchive = (session: HistorySummary) => {
    setArchived(session.id, !session.is_archived).catch(() => {})
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.card }} edges={['top']}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.tint} />
        </Pressable>
        <ThemedText style={[styles.headerTitle, { color: colors.tint }]}>History</ThemedText>
        <View style={styles.backBtn} />
      </View>

      <View style={[styles.controls, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={[styles.searchBox, { backgroundColor: colors.inputBg }]}>
          <Ionicons name="search" size={16} color={colors.muted} />
          <TextInput
            style={[styles.searchInput, { color: colors.oppositeColor }]}
            placeholder="Search sessions or roles"
            placeholderTextColor={colors.muted}
            value={searchInput}
            onChangeText={setSearchInput}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {searchInput.length > 0 && (
            <Pressable onPress={() => setSearchInput('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.muted} />
            </Pressable>
          )}
        </View>

        <View style={styles.sortRow}>
          {SORT_OPTIONS.map((option) => {
            const active = sort === option.value
            return (
              <Pressable
                key={option.value}
                onPress={() => setSort(option.value)}
                style={[
                  styles.sortChip,
                  {
                    backgroundColor: active ? colors.tint : colors.inputBg,
                    borderColor: active ? colors.tint : colors.border,
                  },
                ]}
              >
                <ThemedText
                  style={[styles.sortChipText, { color: active ? '#fff' : colors.subtext }]}
                >
                  {option.label}
                </ThemedText>
              </Pressable>
            )
          })}
        </View>
      </View>

      {error && (
        <View style={[styles.errorBox, { backgroundColor: colors.dangerBg }]}>
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
        <View style={styles.centered}>
          <ActivityIndicator color={colors.tint} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          style={{ backgroundColor: colors.background }}
          contentContainerStyle={[styles.listContent, items.length === 0 && { flexGrow: 1 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={colors.tint} />
          }
          onEndReachedThreshold={0.4}
          onEndReached={loadMore}
          ListHeaderComponent={
            pagination && pagination.total > 0 ? (
              <ThemedText style={[styles.count, { color: colors.subtext }]}>
                {pagination.total} {pagination.total === 1 ? 'session' : 'sessions'}
              </ThemedText>
            ) : null
          }
          renderItem={({ item }) => (
            <SessionCard
              session={item}
              colors={colors}
              onPress={() => router.push({ pathname: '/history/[id]', params: { id: item.id } })}
              onArchive={() => toggleArchive(item)}
              onDelete={() => confirmDelete(item)}
            />
          )}
          ListEmptyComponent={
            error ? null : <EmptyState colors={colors} hasSearch={searchInput.trim().length > 0} />
          }
          ListFooterComponent={
            isLoadingMore ? (
              <ActivityIndicator style={{ marginVertical: 16 }} color={colors.tint} />
            ) : hasMore ? null : items.length > 0 ? (
              <ThemedText style={[styles.endNote, { color: colors.muted }]}>
                You&apos;ve reached the end
              </ThemedText>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  )
}

function SessionCard({
  session,
  colors,
  onPress,
  onArchive,
  onDelete,
}: {
  session: HistorySummary
  colors: any
  onPress: () => void
  onArchive: () => void
  onDelete: () => void
}) {
  const score = session.overall_score
  const scored = score != null
  const band = scoreBand(score)
  const tone =
    band.tone === 'success'
      ? colors.success
      : band.tone === 'warning'
        ? colors.warning
        : band.tone === 'danger'
          ? colors.danger
          : colors.muted
  const toneBg =
    band.tone === 'success'
      ? colors.successBg
      : band.tone === 'warning'
        ? colors.warningBg
        : band.tone === 'danger'
          ? colors.dangerBg
          : colors.inputBg

  const subtitle = [session.job_title, session.company_name].filter(Boolean).join(' · ')

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, { backgroundColor: colors.card, opacity: pressed ? 0.85 : 1 }]}
    >
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <ThemedText style={[styles.cardTitle, { color: colors.oppositeColor }]} numberOfLines={1}>
            {session.session_title || 'Untitled session'}
          </ThemedText>
          {subtitle.length > 0 && (
            <ThemedText style={[styles.cardSub, { color: colors.subtext }]} numberOfLines={1}>
              {subtitle}
            </ThemedText>
          )}
        </View>

        <View style={[styles.scorePill, { backgroundColor: toneBg }]}>
          <ThemedText style={[styles.scorePillText, { color: tone }]}>
            {scored ? formatScore(score) : 'No score'}
          </ThemedText>
        </View>
      </View>

      {scored && (
        <View style={[styles.track, { backgroundColor: colors.border }]}>
          <View
            style={[
              styles.trackFill,
              { backgroundColor: tone, width: `${scoreToPercent(session.overall_score) * 100}%` },
            ]}
          />
        </View>
      )}

      <View style={styles.metaRow}>
        <Meta icon="calendar-outline" text={formatDate(session.started_at)} colors={colors} />
        <Meta icon="time-outline" text={formatDuration(session.duration_seconds)} colors={colors} />
        <Meta
          icon="help-circle-outline"
          text={`${session.questions_answered ?? 0}/${session.total_questions ?? 0}`}
          colors={colors}
        />
      </View>

      <View style={[styles.cardActions, { borderTopColor: colors.divider }]}>
        <View style={styles.badgeRow}>
          {session.status === 'paused' && (
            <View style={[styles.statusBadge, { backgroundColor: colors.warningBg }]}>
              <ThemedText style={[styles.statusBadgeText, { color: colors.warning }]}>Paused</ThemedText>
            </View>
          )}
          {session.is_archived && (
            <View style={[styles.statusBadge, { backgroundColor: colors.inputBg }]}>
              <ThemedText style={[styles.statusBadgeText, { color: colors.subtext }]}>Archived</ThemedText>
            </View>
          )}
        </View>

        <View style={styles.iconActions}>
          <Pressable onPress={onArchive} hitSlop={8} style={styles.iconBtn}>
            <Ionicons
              name={session.is_archived ? 'archive' : 'archive-outline'}
              size={18}
              color={colors.subtext}
            />
          </Pressable>
          <Pressable onPress={onDelete} hitSlop={8} style={styles.iconBtn}>
            <Ionicons name="trash-outline" size={18} color={colors.danger} />
          </Pressable>
        </View>
      </View>
    </Pressable>
  )
}

function Meta({ icon, text, colors }: { icon: any; text: string; colors: any }) {
  return (
    <View style={styles.meta}>
      <Ionicons name={icon} size={13} color={colors.muted} />
      <ThemedText style={[styles.metaText, { color: colors.subtext }]}>{text}</ThemedText>
    </View>
  )
}

function EmptyState({ colors, hasSearch }: { colors: any; hasSearch: boolean }) {
  return (
    <View style={styles.emptyContainer}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.brandSoft }]}>
        <Ionicons name={hasSearch ? 'search' : 'time-outline'} size={30} color={colors.tint} />
      </View>
      <ThemedText style={[styles.emptyTitle, { color: colors.oppositeColor }]}>
        {hasSearch ? 'No matching sessions' : 'No sessions yet'}
      </ThemedText>
      <ThemedText style={[styles.emptyBody, { color: colors.subtext }]}>
        {hasSearch
          ? 'Try a different role, company or session name.'
          : 'Once you finish or pause an interview, it will show up here for review.'}
      </ThemedText>
      {!hasSearch && (
        <Pressable
          style={[styles.startBtn, { backgroundColor: colors.tint }]}
          onPress={() => router.push('/(tabs)/practice')}
        >
          <ThemedText style={styles.startBtnText}>Start an Interview</ThemedText>
          <Ionicons name="play" size={15} color="#fff" />
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: { width: 28 },
  headerTitle: { fontSize: 16, fontWeight: '700' },

  controls: { paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, gap: 10 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 10,
  },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },
  sortRow: { flexDirection: 'row', gap: 8 },
  sortChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  sortChipText: { fontSize: 12, fontWeight: '600' },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
  },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: 20, paddingBottom: 32 },
  count: { fontSize: 12, fontWeight: '600', marginBottom: 12 },
  endNote: { fontSize: 12, textAlign: 'center', marginTop: 8 },

  card: { borderRadius: 14, padding: 14, marginBottom: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardTitle: { fontWeight: '700', fontSize: 15, marginBottom: 3 },
  cardSub: { fontSize: 12 },
  scorePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  scorePillText: { fontSize: 12, fontWeight: '700' },

  track: { height: 5, borderRadius: 3, overflow: 'hidden', marginTop: 12 },
  trackFill: { height: '100%', borderRadius: 3 },

  metaRow: { flexDirection: 'row', gap: 14, marginTop: 12, flexWrap: 'wrap' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12 },

  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  badgeRow: { flexDirection: 'row', gap: 6 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  iconActions: { flexDirection: 'row', gap: 6 },
  iconBtn: { padding: 6 },

  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  emptyTitle: { fontWeight: '700', fontSize: 18, marginBottom: 8, textAlign: 'center' },
  emptyBody: { fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: 22 },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 999,
  },
  startBtnText: { color: '#fff', fontWeight: '700' },
})
