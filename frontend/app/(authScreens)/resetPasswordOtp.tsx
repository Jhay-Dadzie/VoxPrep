import React, { useRef, useState } from 'react'
import { StyleSheet, ScrollView, TextInput, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { ThemedText } from '@/components/themed-text'
import { ThemedView } from '@/components/themed-view'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { Colors } from '@/constants/theme'
import { GlobalStyles } from '@/components/styles/globalStyles'
import Button from '@/components/button'
import { authService } from '@/services/auth'
import { toAuthError } from '@/services/error-handler'

export default function ResetPasswordOtp() {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const { email: emailParam } = useLocalSearchParams<{ email?: string }>()
  const email = typeof emailParam === 'string' ? emailParam : ''
  const [digits, setDigits] = useState(['', '', '', '', '', '', '', ''])
  const [error, setError] = useState<string | null>(null)
  const [isVerifying, setIsVerifying] = useState(false)
  const inputs = useRef<(TextInput | null)[]>([])

  const setDigit = (index: number, value: string) => {
    const next = [...digits]
    next[index] = value.replace(/\D/g, '').slice(-1)
    setDigits(next)
    if (next[index] && index < 7) inputs.current[index + 1]?.focus()
  }

  const verify = async () => {
    const token = digits.join('')
    if (!email) {
      setError('Your email is missing. Please request a new reset code.')
      return
    }
    if (token.length !== 8) return

    setIsVerifying(true)
    setError(null)
    try {
      const session = await authService.verifyPasswordResetOtp(email, token)
      router.replace({
        pathname: '/(authScreens)/resetPassword',
        params: { email, access_token: session.access_token },
      })
    } catch (err) {
      setError(toAuthError(err).message)
    } finally {
      setIsVerifying(false)
    }
  }

  return (
    <ThemedView style={[GlobalStyles.container, { flex: 1 }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedText type="title" style={[styles.title, { color: colors.oppositeColor }]}>Enter Reset Code</ThemedText>
        <ThemedText style={[styles.sub, { color: colors.subtext }]}>Enter the eight-digit code sent to your email.</ThemedText>

        {error && <ThemedText style={[styles.error, { color: colors.danger }]}>{error}</ThemedText>}

        <View style={styles.row}>
          {digits.map((digit, index) => (
            <TextInput
              key={index}
              ref={(input) => { inputs.current[index] = input }}
              value={digit}
              onChangeText={(value) => setDigit(index, value)}
              onKeyPress={({ nativeEvent }) => {
                if (nativeEvent.key === 'Backspace' && !digits[index] && index > 0) {
                  inputs.current[index - 1]?.focus()
                }
              }}
              keyboardType="number-pad"
              maxLength={1}
              style={[styles.cell, { color: colors.oppositeColor, borderColor: digit ? colors.tint : colors.border }]}
            />
          ))}
        </View>

        <Button action={verify} disabled={digits.join('').length !== 8 || isVerifying}>
          <ThemedText type="placeholderText">{isVerifying ? 'Verifying...' : 'Verify Code'}</ThemedText>
        </Button>
      </ScrollView>
    </ThemedView>
  )
}

const styles = StyleSheet.create({
  content: { paddingTop: 48, paddingBottom: 32 },
  title: { textAlign: 'center' },
  sub: { textAlign: 'center', marginTop: 10, marginBottom: 24, fontSize: 14 },
  error: { textAlign: 'center', marginBottom: 16, fontSize: 13 },
  row: { flexDirection: 'row', gap: 8, marginBottom: 22 },
  cell: { flex: 1, height: 54, borderWidth: 1, borderRadius: 10, textAlign: 'center', fontSize: 20, fontWeight: '700' },
})
