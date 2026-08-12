import { StyleSheet, ScrollView, View, Alert } from 'react-native'
import React, { useMemo, useState } from 'react'
import { router, useLocalSearchParams } from 'expo-router'
import { useLinkingURL } from 'expo-linking'
import { Ionicons } from '@expo/vector-icons'
import { ThemedText } from '@/components/themed-text'
import { ThemedView } from '@/components/themed-view'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { Colors } from '@/constants/theme'
import { GlobalStyles } from '@/components/styles/globalStyles'
import Button from '@/components/button'
import Input from '@/components/input'
import { authService } from '@/services/auth'
import { AuthError } from '@/services/error-handler'

export default function ResetPassword() {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const routeParams = useLocalSearchParams<{
    email?: string
    token?: string
    token_hash?: string
    code?: string
    access_token?: string
  }>()
  const linkingUrl = useLinkingURL()
  const linkParams = useMemo(() => parseResetLink(linkingUrl), [linkingUrl])
  const email = firstParam(routeParams.email, linkParams.email)
  const token = firstParam(routeParams.token, linkParams.token)
  const tokenHash = firstParam(routeParams.token_hash, linkParams.token_hash)
  const code = firstParam(routeParams.code, linkParams.code)
  const accessToken = firstParam(routeParams.access_token, linkParams.access_token)
  const [pw, setPw] = useState('')
  const [cpw, setCpw] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasLen = pw.length >= 8
  const hasNum = /\d/.test(pw)
  const hasSym = /[^A-Za-z0-9]/.test(pw)
  const strength = (hasLen ? 1 : 0) + (hasNum ? 1 : 0) + (hasSym ? 1 : 0)
  const labels = ['', 'Weak', 'Medium', 'Strong']
  const canSubmit = strength === 3 && pw === cpw

  const handleResetPassword = async () => {
    if (!accessToken && !code && !tokenHash && (!email || !token)) {
      setError('Invalid reset link. Please request a new one.')
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      await authService.resetPassword({
        ...(email ? { email } : {}),
        ...(token ? { token } : {}),
        ...(tokenHash ? { token_hash: tokenHash } : {}),
        ...(code ? { code } : {}),
        ...(accessToken ? { access_token: accessToken } : {}),
        password: pw,
      })
      Alert.alert(
        'Password Reset',
        'Your password has been reset successfully.',
        [{ text: 'OK', onPress: () => router.replace('/(authScreens)/signin') }]
      )
    } catch (err) {
      if (err instanceof AuthError) {
        setError(err.message)
      } else {
        setError('Failed to reset password. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <ThemedView style={[GlobalStyles.container, { flex: 1 }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 24, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <ThemedText type='title' style={[styles.title, { color: colors.oppositeColor }]}>
          Create New{'\n'}Password
        </ThemedText>
        <ThemedText style={[styles.sub, { color: colors.subtext }]}>
          Your email has been verified. Please enter a new password to secure your account.
        </ThemedText>

        {error && (
          <View style={[styles.errorBox, { backgroundColor: colors.dangerBg }]}>
            <ThemedText style={{ color: colors.danger, fontSize: 13 }}>{error}</ThemedText>
          </View>
        )}

        <Input label='New Password' placeholder='••••••••' password value={pw} onChangeText={setPw} />

        <View style={[styles.strengthCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <View style={styles.strengthHeader}>
            <View style={[styles.strengthBarBg, { backgroundColor: colors.border }]}>
              <View style={[styles.strengthFill, { width: `${(strength / 3) * 100}%`, backgroundColor: colors.tint }]} />
            </View>
            <ThemedText style={{ color: colors.tint, fontWeight: '600', fontSize: 13 }}>
              {labels[strength] || 'Weak'}
            </ThemedText>
          </View>
          <Check on={hasLen} label='Min 8 characters' />
          <Check on={hasNum} label='1 number' />
          <Check on={hasSym} label='1 special character' />
        </View>

        <Input label='Confirm New Password' placeholder='••••••••' password value={cpw} onChangeText={setCpw} />

        <Button action={handleResetPassword} disabled={!canSubmit || isLoading}>
          <ThemedText type='placeholderText'>
            {isLoading ? 'Updating...' : 'Update Password'}
          </ThemedText>
        </Button>

        <View style={styles.footer}>
          <Ionicons name='shield-checkmark' size={14} color={colors.muted} />
          <ThemedText style={{ color: colors.muted, fontSize: 11, letterSpacing: 1, fontWeight: '600' }}>
            SECURED BY VOXPREP
          </ThemedText>
        </View>
      </ScrollView>
    </ThemedView>
  )
}

function firstParam(...values: (string | string[] | undefined)[]): string | undefined {
  const value = values.find((candidate) => typeof candidate === 'string' && candidate.length > 0)
  return typeof value === 'string' ? value : undefined
}

function parseResetLink(url: string | null): Record<string, string> {
  if (!url) return {}

  try {
    const query = url.includes('?') ? url.split('?')[1]?.split('#')[0] : ''
    const hash = url.includes('#') ? url.split('#')[1] : ''
    const params = new URLSearchParams(`${query || ''}${query && hash ? '&' : ''}${hash || ''}`)
    return Object.fromEntries(params.entries())
  } catch {
    return {}
  }
}

function Check({ on, label }: { on: boolean; label: string }) {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  return (
    <View style={styles.checkRow}>
      <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={on ? colors.tint : colors.muted} />
      <ThemedText style={{ color: on ? colors.oppositeColor : colors.subtext, fontSize: 13 }}>{label}</ThemedText>
    </View>
  )
}

const styles = StyleSheet.create({
  title: { marginTop: 12, fontSize: 26, lineHeight: 32 },
  sub: { marginTop: 10, marginBottom: 20, fontSize: 14, lineHeight: 20 },
  errorBox: { padding: 12, borderRadius: 8, marginBottom: 16 },
  strengthCard: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 14 },
  strengthHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  strengthBarBg: { flex: 1, height: 6, borderRadius: 3, marginRight: 10, overflow: 'hidden' },
  strengthFill: { height: '100%' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 4 },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 24 },
})
