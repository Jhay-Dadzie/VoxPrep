import React from 'react'
import { Modal, Pressable, StyleSheet, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { ThemedText } from '@/components/themed-text'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { Colors } from '@/constants/theme'

/**
 * Themed confirmation dialog for actions worth a second thought.
 *
 * Deliberately not Alert.alert: the app ships to web through react-native-web,
 * where Alert is unreliable, and a native alert ignores the theme. This renders
 * the same on every target and in both colour schemes.
 *
 * Dismissing — backdrop tap, or Android back — always cancels. Confirming is
 * only ever the explicit button press.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  icon,
  destructive = false,
  onConfirm,
  onCancel,
}: {
  visible: boolean
  title: string
  message: string
  confirmLabel: string
  cancelLabel?: string
  icon?: any
  /** Tints the icon and confirm button with the danger colour. */
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const accent = destructive ? colors.danger : colors.tint
  const accentBg = destructive ? colors.dangerBg : colors.brandSoft

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <Pressable style={styles.backdrop} onPress={onCancel} accessibilityLabel="Dismiss">
        {/* Swallows taps so pressing the card itself does not dismiss. */}
        <Pressable
          style={[styles.card, { backgroundColor: colors.card }]}
          onPress={() => {}}
          accessibilityViewIsModal
        >
          {icon && (
            <View style={[styles.iconWrap, { backgroundColor: accentBg }]}>
              <Ionicons name={icon} size={24} color={accent} />
            </View>
          )}

          <ThemedText style={[styles.title, { color: colors.oppositeColor }]}>{title}</ThemedText>
          <ThemedText style={[styles.message, { color: colors.subtext }]}>{message}</ThemedText>

          <View style={styles.actions}>
            <Pressable
              style={[styles.btn, styles.btnOutline, { borderColor: colors.border }]}
              onPress={onCancel}
              accessibilityRole="button"
            >
              <ThemedText style={[styles.btnText, { color: colors.oppositeColor }]}>
                {cancelLabel}
              </ThemedText>
            </Pressable>

            <Pressable
              style={[styles.btn, { backgroundColor: accent }]}
              onPress={onConfirm}
              accessibilityRole="button"
            >
              <ThemedText style={[styles.btnText, { color: '#fff' }]}>{confirmLabel}</ThemedText>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#00000080',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  card: { width: '100%', maxWidth: 380, borderRadius: 16, padding: 22, alignItems: 'center' },
  iconWrap: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
  },
  title: { fontSize: 17, fontWeight: '800', textAlign: 'center' },
  message: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8, marginBottom: 20 },

  actions: { flexDirection: 'row', gap: 12, width: '100%' },
  btn: { flex: 1, borderRadius: 999, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  btnOutline: { borderWidth: 1 },
  btnText: { fontWeight: '700', fontSize: 14 },
})
