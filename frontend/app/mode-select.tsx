import React, { useEffect, useState } from 'react'
import { StyleSheet, View, ScrollView, Pressable } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ThemedText } from '@/components/themed-text'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { useMode } from '@/hooks/mode-context'
import { Colors } from '@/constants/theme'
import { MODE_LIST, type ModeId } from '@/constants/modes'

/**
 * Mode picker — first of the two setup steps shown on every login, before
 * interviewer-select.
 *
 * It sits after auth rather than before it so that logging out and back in is
 * how you switch what you are preparing for. The stored choice is pre-selected,
 * so a user who wants the same setup as last time just taps through.
 *
 * The choice reskins the whole app, so it is deliberately a considered step
 * with a confirm button rather than a tap-through.
 */
export default function ModeSelect() {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const { modeId, setMode, isLoaded } = useMode()
  const [selected, setSelected] = useState<ModeId>(modeId)

  // The stored mode is read back from AsyncStorage after first render, so the
  // initial state above can be the default rather than the user's real choice.
  // Adopt it once it lands. modeId only changes again via Continue, which
  // navigates away, so this never fights the user's tap.
  useEffect(() => {
    if (isLoaded) setSelected(modeId)
  }, [isLoaded, modeId])

  const handleContinue = () => {
    setMode(selected)
    router.push('/interviewer-select')
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 28, flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
        <ThemedText style={[styles.brand, { color: colors.tint }]}>VoxPrep</ThemedText>

        <ThemedText style={[styles.title, { color: colors.oppositeColor }]}>
          What are you{'\n'}preparing for?
        </ThemedText>
        <ThemedText style={[styles.sub, { color: colors.subtext }]}>
          This shapes your questions, your feedback, and how the app is set up. You can change it
          later in Settings, or next time you log in.
        </ThemedText>

        <View style={{ gap: 12 }}>
          {MODE_LIST.map((mode) => {
            const isSelected = selected === mode.id
            return (
              <Pressable
                key={mode.id}
                onPress={() => setSelected(mode.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${mode.label}. ${mode.tagline}`}
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.card,
                    borderColor: isSelected ? colors.tint : colors.border,
                    borderWidth: isSelected ? 2 : 1,
                  },
                ]}
              >
                <View
                  style={[
                    styles.iconWrap,
                    { backgroundColor: isSelected ? colors.tint : colors.brandSoft },
                  ]}
                >
                  <Ionicons
                    name={mode.icon as any}
                    size={22}
                    color={isSelected ? '#fff' : colors.tint}
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <ThemedText style={[styles.cardTitle, { color: colors.oppositeColor }]}>
                    {mode.label}
                  </ThemedText>
                  <ThemedText style={[styles.cardBody, { color: colors.subtext }]}>
                    {mode.tagline}
                  </ThemedText>
                </View>

                <Ionicons
                  name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                  size={22}
                  color={isSelected ? colors.tint : colors.muted}
                />
              </Pressable>
            )
          })}
        </View>

        <View style={{ flex: 1, minHeight: 24 }} />

        <Pressable
          style={[styles.cta, { backgroundColor: colors.tint }]}
          onPress={handleContinue}
          accessibilityRole="button"
        >
          <ThemedText style={styles.ctaText}>Continue</ThemedText>
          <Ionicons name="arrow-forward" size={16} color="#fff" />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  brand: { fontWeight: '700', fontSize: 17, marginBottom: 28 },

  title: { fontSize: 28, fontWeight: '800', lineHeight: 34 },
  sub: { fontSize: 14, marginTop: 12, marginBottom: 24, lineHeight: 20 },

  card: {
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  iconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  cardBody: { fontSize: 13, marginTop: 2, lineHeight: 18 },

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
