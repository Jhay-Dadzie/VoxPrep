import React, { useEffect, useState } from 'react'
import { StyleSheet, View, ScrollView, Pressable, Image } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ThemedText } from '@/components/themed-text'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { useMode } from '@/hooks/mode-context'
import { useInterviewer } from '@/hooks/interviewer-context'
import { useAuth } from '@/hooks/auth-context'
import { userService } from '@/services/user'
import { AuthError } from '@/services/error-handler'
import { Colors } from '@/constants/theme'
import {
  INTERVIEWER_LIST,
  describeComposition,
  avatarSource,
  shortName,
  type InterviewerId,
  type Panelist,
} from '@/constants/interviewers'

/**
 * Interviewer picker — the step after mode-select, and the last one before the
 * dashboard.
 *
 * Mode decides what you are asked; this decides who asks it. It sits inside the
 * login flow for the same reason mode-select does: logging back in is how you
 * change your setup.
 */
export default function SelectInterviewer() {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const { copy } = useMode()
  const { interviewerId, setInterviewer, isLoaded } = useInterviewer()
  const { updateUser } = useAuth()
  const [selected, setSelected] = useState<InterviewerId>(interviewerId)
  const [isContinuing, setIsContinuing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The stored choice is read back from AsyncStorage after first render, so the
  // initial state above can be the default rather than the user's real choice.
  useEffect(() => {
    if (isLoaded) setSelected(interviewerId)
  }, [isLoaded, interviewerId])

  const handleContinue = async () => {
    if (isContinuing) return

    setIsContinuing(true)
    setError(null)
    setInterviewer(selected)
    try {
      const completedUser = await userService.completeProfile()
      await updateUser(completedUser)
      router.replace('/(tabs)/dashboard')
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'Could not finish setup. Please try again.')
    } finally {
      setIsContinuing(false)
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 28, flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topRow}>
          <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={22} color={colors.tint} />
          </Pressable>
          <ThemedText style={[styles.brand, { color: colors.tint }]}>VoxPrep</ThemedText>
        </View>

        <ThemedText style={[styles.title, { color: colors.oppositeColor }]}>
          Who should{'\n'}question you?
        </ThemedText>
        <ThemedText style={[styles.sub, { color: colors.subtext }]}>
          This sets the voices you will hear during each {copy.sessionNoun}. A panel takes turns and
          presses from different angles, so it is the harder practice.
        </ThemedText>

        <View style={{ gap: 12 }}>
          {INTERVIEWER_LIST.map((option) => {
            const isSelected = selected === option.id
            // Two panels share the name "Panel of three" and differ only in who
            // is on them, so the split has to sit in the title to tell them apart.
            const composition = option.isPanel ? describeComposition(option.members) : null
            return (
              <Pressable
                key={option.id}
                onPress={() => setSelected(option.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={
                  composition
                    ? `${option.label}, ${composition}. ${option.tagline}`
                    : `${option.label}. ${option.tagline}`
                }
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.card,
                    borderColor: isSelected ? colors.tint : colors.border,
                    borderWidth: isSelected ? 2 : 1,
                  },
                ]}
              >
                <View style={styles.cardHead}>
                  <View
                    style={[
                      styles.iconWrap,
                      { backgroundColor: isSelected ? colors.tint : colors.brandSoft },
                    ]}
                  >
                    <Ionicons
                      name={option.icon as any}
                      size={22}
                      color={isSelected ? '#fff' : colors.tint}
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <ThemedText style={[styles.cardTitle, { color: colors.oppositeColor }]}>
                      {option.label}
                      {composition && (
                        <ThemedText style={[styles.cardTitleMeta, { color: colors.muted }]}>
                          {'   '}
                          {composition}
                        </ThemedText>
                      )}
                    </ThemedText>
                    <ThemedText style={[styles.cardBody, { color: colors.subtext }]}>
                      {option.tagline}
                    </ThemedText>
                  </View>

                  <Ionicons
                    name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={isSelected ? colors.tint : colors.muted}
                  />
                </View>

                <View style={[styles.roster, { borderTopColor: colors.border }]}>
                  {option.members.map((m) => (
                    <MemberChip key={m.voiceId} member={m} colors={colors} />
                  ))}
                </View>

              </Pressable>
            )
          })}
        </View>

        <View style={{ flex: 1, minHeight: 24 }} />

        {error && <ThemedText style={{ color: colors.danger, marginBottom: 12 }}>{error}</ThemedText>}

        <Pressable
          style={[styles.cta, { backgroundColor: colors.tint, opacity: isContinuing ? 0.6 : 1 }]}
          onPress={handleContinue}
          disabled={isContinuing}
          accessibilityRole="button"
        >
          <ThemedText style={styles.ctaText}>{isContinuing ? 'Saving...' : 'Continue'}</ThemedText>
          <Ionicons name="arrow-forward" size={16} color="#fff" />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  )
}

function MemberChip({ member, colors }: { member: Panelist; colors: any }) {
  return (
    <View style={styles.member}>
      <Image source={avatarSource(member)} style={styles.memberAvatar} />
      <ThemedText style={[styles.memberName, { color: colors.oppositeColor }]} numberOfLines={1}>
        {shortName(member)}
      </ThemedText>
      <ThemedText style={[styles.memberRole, { color: colors.muted }]} numberOfLines={1}>
        {member.role}
      </ThemedText>
    </View>
  )
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 24 },
  brand: { fontWeight: '700', fontSize: 17 },

  title: { fontSize: 28, fontWeight: '800', lineHeight: 34 },
  sub: { fontSize: 14, marginTop: 12, marginBottom: 24, lineHeight: 20 },

  card: { borderRadius: 12, padding: 16 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  iconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  cardTitleMeta: { fontSize: 12, fontWeight: '600' },
  cardBody: { fontSize: 13, marginTop: 2, lineHeight: 18 },

  roster: { flexDirection: 'row', gap: 14, marginTop: 14, paddingTop: 14, borderTopWidth: 1 },
  member: { alignItems: 'center', width: 62 },
  memberAvatar: { width: 40, height: 40, borderRadius: 20, marginBottom: 5 },
  memberName: { fontSize: 11, fontWeight: '700' },
  memberRole: { fontSize: 10, marginTop: 1 },

  cta: {
    borderRadius: 999,
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  ctaText: { color: '#fff', fontWeight: '700', fontSize: 15 },
})
