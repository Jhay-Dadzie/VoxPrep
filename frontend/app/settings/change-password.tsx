import React, { useState } from 'react'
import { StyleSheet, View, ScrollView, Pressable, TextInput, Alert } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ThemedText } from '@/components/themed-text'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { Colors } from '@/constants/theme'
import { authService } from '@/services/auth'
import { AuthError } from '@/services/error-handler'

export default function ChangePassword() {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isValid = current && next && confirm && next === confirm && next.length >= 8
  const confirmError = next !== confirm && confirm.length > 0 ? 'Passwords do not match' : undefined

  const handleSave = async () => {
    if (!isValid) return

    setIsSaving(true)
    setError(null)

    try {
      await authService.changePassword({
        current_password: current,
        new_password: next,
      })
      Alert.alert('Success', 'Password changed successfully', [
        { text: 'OK', onPress: () => router.back() },
      ])
    } catch (err) {
      if (err instanceof AuthError) {
        setError(err.message)
      } else {
        setError('Failed to change password. Please try again.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.card }} edges={['top']}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={colors.tint} />
        </Pressable>
        <ThemedText style={[styles.headerTitle, { color: colors.oppositeColor }]}>Settings</ThemedText>
      </View>

      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        <ThemedText style={[styles.title, { color: colors.oppositeColor }]}>Change Password</ThemedText>
        <ThemedText style={[styles.sub, { color: colors.subtext }]}>
          Update your password to keep your account secure. Use a combination of letters, numbers, and symbols.
        </ThemedText>

        {error && (
          <View style={[styles.errorBox, { backgroundColor: colors.dangerBg }]}>
            <Ionicons name="alert-circle" size={16} color={colors.danger} />
            <ThemedText style={[styles.errorText, { color: colors.danger }]}>{error}</ThemedText>
          </View>
        )}

        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <PwField label="Current Password" value={current} onChangeText={setCurrent} placeholder="••••••••" colors={colors} />
          <View style={[styles.divider, { backgroundColor: colors.divider }]} />
          <PwField label="New Password" value={next} onChangeText={setNext} placeholder="Min. 8 chars" colors={colors} />
          <PwField
            label="Confirm New Password"
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Match new password"
            colors={colors}
            error={confirmError}
            last
          />

          <View style={[styles.tip, { backgroundColor: colors.brandSoft }]}>
            <Ionicons name="shield-checkmark" size={16} color={colors.tint} />
            <View style={{ flex: 1 }}>
              <ThemedText style={[styles.tipTitle, { color: colors.oppositeColor }]}>Account Security Tip</ThemedText>
              <ThemedText style={[styles.tipBody, { color: colors.subtext }]}>
                Avoid using common words or personal info. Use a password manager for better security.
              </ThemedText>
            </View>
          </View>
        </View>

        <Pressable
          style={[styles.save, { backgroundColor: isValid ? colors.tint : colors.muted }]}
          onPress={handleSave}
          disabled={!isValid || isSaving}
        >
          <ThemedText style={styles.saveText}>
            {isSaving ? 'Updating...' : 'Update Password'}
          </ThemedText>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  )
}

function PwField({
  label, value, onChangeText, placeholder, colors, last, error,
}: { label: string; value: string; onChangeText: (s: string) => void; placeholder: string; colors: any; last?: boolean; error?: string }) {
  const [hide, setHide] = useState(true)
  return (
    <View style={{ marginBottom: last ? 0 : 14 }}>
      <ThemedText style={[styles.fieldLabel, { color: colors.subtext }]}>{label}</ThemedText>
      <View style={[styles.inputWrap, { backgroundColor: colors.inputBg, borderColor: error ? colors.danger : colors.border }]}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          secureTextEntry={hide}
          style={[styles.input, { color: colors.oppositeColor }]}
        />
        <Pressable onPress={() => setHide(!hide)} hitSlop={8}>
          <Ionicons name={hide ? 'eye-outline' : 'eye-off-outline'} size={18} color={colors.muted} />
        </Pressable>
      </View>
      {error && (
        <View style={styles.errRow}>
          <Ionicons name="alert-circle" size={14} color={colors.danger} />
          <ThemedText style={[styles.err, { color: colors.danger }]}>{error}</ThemedText>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1 },
  headerTitle: { fontSize: 17, fontWeight: '700' },

  title: { fontSize: 22, fontWeight: '800', marginTop: 8, marginBottom: 6 },
  sub: { fontSize: 14, lineHeight: 20, marginBottom: 18 },

  errorBox: { flexDirection: 'row', gap: 10, borderRadius: 12, padding: 12, marginBottom: 16 },
  errorText: { flex: 1, fontSize: 13, lineHeight: 18 },

  card: { borderRadius: 14, padding: 16, marginBottom: 18 },
  fieldLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, borderWidth: 1, paddingHorizontal: 12 },
  input: { flex: 1, paddingVertical: 12, fontSize: 14 },
  divider: { height: 1, marginBottom: 14 },
  errRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4 },
  err: { fontSize: 12, marginLeft: 4, lineHeight: 16 },

  tip: { flexDirection: 'row', gap: 10, borderRadius: 10, padding: 12 },
  tipTitle: { fontWeight: '700', fontSize: 13, marginBottom: 2 },
  tipBody: { fontSize: 12, lineHeight: 17 },

  save: { borderRadius: 999, paddingVertical: 16, alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 15 },
})
