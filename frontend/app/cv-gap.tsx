import React, { useState } from 'react'
import { StyleSheet, View, ScrollView, Pressable } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ThemedText } from '@/components/themed-text'
import { ModeBadge } from '@/components/mode-badge'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { useSession } from '@/hooks/session-context'
import { Colors } from '@/constants/theme'

/**
 * CV gap analysis — reached from the results screen, after an interview.
 *
 * Deliberately post-interview: showing a candidate what their CV is missing
 * beforehand primes them to work those exact points into their answers, which
 * turns the interview into a rehearsal of the feedback.
 *
 * Only reachable when the analysis found genuine gaps. A CV that already fits
 * the role gets a confirmation on the results screen and no advice.
 */

type Gap = {
  id: string
  title: string
  detail: string
  /** Shown when the card is expanded — the concrete rewrite to make. */
  suggestion: string
}

/** Shown only when this screen is opened without a finished session behind it. */
const SAMPLE_MISSING: Gap[] = [
  {
    id: 'm1',
    title: 'Kubernetes / container orchestration',
    detail:
      'Named three times in the job description, including once under "must have". Your CV does not mention it.',
    suggestion:
      'If you have used it, add it to your most recent role with the scale attached — "deployed and maintained 12 services on Kubernetes". If you have not, prepare an honest answer that names the closest thing you have done.',
  },
  {
    id: 'm2',
    title: 'Mentoring or leading engineers',
    detail:
      'The role expects you to "guide junior developers". Nothing in your CV describes mentoring.',
    suggestion:
      'Add a line to your current role: "Mentored 2 junior engineers through onboarding and code review." Even informal mentoring counts if you can describe what changed for them.',
  },
  {
    id: 'm3',
    title: 'Stakeholder communication',
    detail:
      'Listed under responsibilities. Your CV is entirely technical and shows no non-engineering audience.',
    suggestion:
      'Name one instance where you explained a technical trade-off to a non-technical decision maker, and what they decided as a result.',
  },
]

const SAMPLE_VAGUE: Gap[] = [
  {
    id: 'v1',
    title: '"Improved application performance"',
    detail: 'No baseline, no result, no method. An interviewer cannot probe this, so they will.',
    suggestion:
      'Rewrite with the numbers: "Cut p95 API latency from 800ms to 210ms by adding query indexes and a response cache." If you do not have exact figures, an honest estimate with the method beats a bare claim.',
  },
  {
    id: 'v2',
    title: '"Worked on a large-scale system"',
    detail: '"Large-scale" means nothing without a number. Expect to be asked what large meant.',
    suggestion:
      'Quantify the axis that was actually hard — requests per second, data volume, number of users, or team size. One concrete number does more than the adjective.',
  },
  {
    id: 'v3',
    title: '"Familiar with CI/CD"',
    detail:
      '"Familiar with" reads as "have not really done it" to most interviewers. It invites a sceptical follow-up.',
    suggestion:
      'Either commit to it — "Built the GitHub Actions pipeline that runs our test suite and deploys to staging" — or drop it and spend the line on something you own.',
  },
]

export default function CvGap() {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const { session } = useSession()
  const [expanded, setExpanded] = useState<string | null>(null)

  const analysis = session?.cvAnalysis ?? null
  // The samples keep the screen viewable if it is opened directly, without a
  // finished session behind it.
  const missing = analysis?.missing ?? SAMPLE_MISSING
  const vague = analysis?.vague ?? SAMPLE_VAGUE

  const toggle = (id: string) => setExpanded((cur) => (cur === id ? null : id))
  const total = missing.length + vague.length

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.card }} edges={['top']}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={22} color={colors.tint} />
        </Pressable>
        <ThemedText style={[styles.headerTitle, { color: colors.tint }]}>CV Gap Analysis</ThemedText>
        <View style={{ flex: 1 }} />
        <ModeBadge />
      </View>

      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        <ThemedText style={[styles.heroTitle, { color: colors.oppositeColor }]}>
          {total} {total === 1 ? 'gap' : 'gaps'} between your CV{'\n'}and this role
        </ThemedText>
        <ThemedText style={[styles.heroSub, { color: colors.subtext }]}>
          {analysis?.verdict ??
            'These are the points a recruiter screening for this role would notice. Tap any card for the rewrite.'}
        </ThemedText>

        <Section
          icon="alert-circle"
          title="Missing from your CV"
          caption="In the job description, absent from your CV"
          tone={colors.danger}
          toneBg={colors.dangerBg}
          count={missing.length}
          colors={colors}
        />
        {missing.map((gap) => (
          <GapCard
            key={gap.id}
            gap={gap}
            accent={colors.danger}
            expanded={expanded === gap.id}
            onPress={() => toggle(gap.id)}
            colors={colors}
          />
        ))}

        <Section
          icon="help-circle"
          title="Vague or unquantified"
          caption="On your CV, but too soft to defend"
          tone={colors.warning}
          toneBg={colors.warningBg}
          count={vague.length}
          colors={colors}
        />
        {vague.map((gap) => (
          <GapCard
            key={gap.id}
            gap={gap}
            accent={colors.warning}
            expanded={expanded === gap.id}
            onPress={() => toggle(gap.id)}
            colors={colors}
          />
        ))}

        <Pressable
          style={[styles.cta, { backgroundColor: colors.tint }]}
          onPress={() => router.back()}
          accessibilityRole="button"
        >
          <ThemedText style={styles.ctaText}>Back to Results</ThemedText>
          <Ionicons name="arrow-back" size={16} color="#fff" />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  )
}

function Section({
  icon, title, caption, tone, toneBg, count, colors,
}: {
  icon: any; title: string; caption: string
  tone: string; toneBg: string; count: number; colors: any
}) {
  return (
    <View style={styles.sectionHead}>
      <View style={[styles.sectionIcon, { backgroundColor: toneBg }]}>
        <Ionicons name={icon} size={16} color={tone} />
      </View>
      <View style={{ flex: 1 }}>
        <ThemedText style={[styles.sectionTitle, { color: colors.oppositeColor }]}>{title}</ThemedText>
        <ThemedText style={[styles.sectionCaption, { color: colors.subtext }]}>{caption}</ThemedText>
      </View>
      <View style={[styles.countPill, { backgroundColor: toneBg }]}>
        <ThemedText style={[styles.countText, { color: tone }]}>{count}</ThemedText>
      </View>
    </View>
  )
}

function GapCard({
  gap, accent, expanded, onPress, colors,
}: {
  gap: Gap; accent: string; expanded: boolean; onPress: () => void; colors: any
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      style={[styles.card, { backgroundColor: colors.card }]}
    >
      <LinearGradient
        colors={[accent, '#7A4CF0']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.cardAccent}
      />

      <View style={styles.cardInner}>
        <View style={styles.cardTop}>
          <ThemedText style={[styles.cardTitle, { color: colors.oppositeColor }]}>
            {gap.title}
          </ThemedText>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.muted}
          />
        </View>

        <ThemedText style={[styles.cardDetail, { color: colors.subtext }]}>{gap.detail}</ThemedText>

        {expanded && (
          <View style={[styles.suggestion, { backgroundColor: colors.inputBg }]}>
            <View style={styles.suggestionHead}>
              <Ionicons name="sparkles" size={14} color={colors.tint} />
              <ThemedText style={[styles.suggestionTag, { color: colors.tint }]}>
                SUGGESTED REWRITE
              </ThemedText>
            </View>
            <ThemedText style={[styles.suggestionText, { color: colors.oppositeColor }]}>
              {gap.suggestion}
            </ThemedText>
          </View>
        )}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1 },
  headerTitle: { fontSize: 16, fontWeight: '700' },

  heroTitle: { fontSize: 24, fontWeight: '800', lineHeight: 31, marginTop: 4 },
  heroSub: { fontSize: 14, lineHeight: 20, marginTop: 10, marginBottom: 6 },

  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 22, marginBottom: 12 },
  sectionIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '800' },
  sectionCaption: { fontSize: 12, marginTop: 1 },
  countPill: { minWidth: 26, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, alignItems: 'center' },
  countText: { fontSize: 13, fontWeight: '800' },

  card: { borderRadius: 14, overflow: 'hidden', flexDirection: 'row', marginBottom: 10 },
  cardAccent: { width: 6 },
  cardInner: { flex: 1, padding: 14 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardTitle: { flex: 1, fontSize: 14, fontWeight: '700', lineHeight: 20 },
  cardDetail: { fontSize: 13, lineHeight: 19, marginTop: 6 },

  suggestion: { borderRadius: 10, padding: 12, marginTop: 12 },
  suggestionHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  suggestionTag: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  suggestionText: { fontSize: 13, lineHeight: 19 },

  cta: {
    borderRadius: 999, height: 54, marginTop: 24,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  ctaText: { color: '#fff', fontWeight: '700', fontSize: 15 },
})
