import React from 'react'
import { StyleSheet, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { ThemedText } from '@/components/themed-text'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { useMode } from '@/hooks/mode-context'
import { Colors } from '@/constants/theme'

/**
 * Small pill naming the active practice mode.
 *
 * Sits in screen headers so the user can always tell which vocabulary they are
 * looking at — the copy changes per mode, and without this the change is easy
 * to mistake for a bug.
 */
export function ModeBadge() {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const { mode } = useMode()

  return (
    <View
      style={[styles.badge, { backgroundColor: colors.brandSoft }]}
      accessibilityLabel={`Current mode: ${mode.label}`}
    >
      <Ionicons name={mode.icon as any} size={12} color={colors.tint} />
      <ThemedText style={[styles.text, { color: colors.tint }]}>{mode.label}</ThemedText>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  text: { fontSize: 11, fontWeight: '700' },
})
