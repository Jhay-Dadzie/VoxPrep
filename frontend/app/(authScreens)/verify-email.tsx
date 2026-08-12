import { StyleSheet, ScrollView, View, TextInput, Pressable } from 'react-native'
import React, { useEffect, useRef, useState } from 'react'
import { router, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { ThemedText } from '@/components/themed-text'
import { ThemedView } from '@/components/themed-view'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { Colors } from '@/constants/theme'
import { GlobalStyles } from '@/components/styles/globalStyles'
import Button from '@/components/button'
import { authService } from '@/services/auth'
import { AuthError } from '@/services/error-handler'

export default function VerifyEmail() {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const { email: emailParam } = useLocalSearchParams<{ email?: string }>()
  const email = typeof emailParam === 'string' ? emailParam : ''
  const [digits, setDigits] = useState(['', '', '', '', '', '', '', ''])
  const [seconds, setSeconds] = useState(120)
  const [error, setError] = useState<string | null>(null)
  const [isVerifying, setIsVerifying] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const inputs = useRef<(TextInput | null)[]>([])

  useEffect(() => {
    if (seconds <= 0) return
    const t = setInterval(() => setSeconds(s => s - 1), 1000)
    return () => clearInterval(t)
  }, [seconds])

  const setAt = (i: number, v: string) => {
    const next = [...digits]
    next[i] = v.slice(-1)
    setDigits(next)
    if (v && i < 7) inputs.current[i + 1]?.focus()
  }

  const fillCount = digits.filter(Boolean).length
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')

  const handleVerify = async () => {
    const code = digits.join('')
    if (code.length !== 8) return
    if (!email) {
      setError('Your signup email is missing. Please create the account again.')
      return
    }

    setIsVerifying(true)
    setError(null)
    try {
      await authService.verifyEmail(email, code)
      router.replace({ pathname: '/(authScreens)/signin', params: { email } })
    } catch (err) {
      if (err instanceof AuthError) {
        setError(err.message)
      } else {
        setError('Verification failed. Please try again.')
      }
    } finally {
      setIsVerifying(false)
    }
  }

  return (
    <ThemedView style={[GlobalStyles.container, { flex: 1 }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 24, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={[styles.iconBox, { backgroundColor: colors.brandSoft }]}>
            <Ionicons name='mail' size={26} color={colors.tint} />
          </View>
          <ThemedText type='title' style={[styles.title, { color: colors.oppositeColor }]}>Verify Your Email</ThemedText>
          <ThemedText style={[styles.sub, { color: colors.subtext }]}>
            We&apos;ve sent a 8-digit verification code to your inbox. Please enter it below to secure your account.
          </ThemedText>

          {error && (
            <View style={[styles.errorBox, { backgroundColor: colors.dangerBg }]}>
              <ThemedText style={{ color: colors.danger, fontSize: 13 }}>{error}</ThemedText>
            </View>
          )}

          <View style={styles.row}>
            {digits.map((d, i) => (
              <TextInput
              key={i}
              ref={(r) => {
                inputs.current[i] = r
              }}
              value={d}
              onChangeText={(v) => setAt(i, v)}
              onKeyPress={({ nativeEvent }) => {
                if (nativeEvent.key === 'Backspace') {
                  const next = [...digits]

                  if (digits[i]) {
                    next[i] = ''
                    setDigits(next)
                  } else if (i > 0) {
                    next[i - 1] = ''
                    setDigits(next)
                    inputs.current[i - 1]?.focus()
                  }
                }
              }}
              keyboardType="number-pad"
              maxLength={1}
              style={[
                styles.cell,
                {
                  borderColor: d ? colors.tint : colors.border,
                  color: colors.oppositeColor,
                  backgroundColor: colors.card,
                },
              ]}
            />
            ))}
          </View>

          <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
            <View style={[styles.progressFill, { width: `${(fillCount / 8) * 100}%`, backgroundColor: colors.tint }]} />
          </View>

          <Button action={handleVerify} disabled={fillCount < 8 || isVerifying}>
            <ThemedText type='placeholderText'>{isVerifying ? 'Verifying...' : 'Verify Account'}</ThemedText>
          </Button>

          <ThemedText style={[styles.didnt, { color: colors.subtext }]}>Didn&apos;t receive the email?</ThemedText>
          <View style={styles.timerRow}>
            <Ionicons name='time-outline' size={14} color={colors.muted} />
            <ThemedText style={{ color: colors.subtext, fontSize: 13 }}>
              Resend code in <ThemedText style={{ color: colors.tint, fontWeight: '600' }}>{mm}:{ss}</ThemedText>
            </ThemedText>
          </View>
          <Pressable
            disabled={seconds > 0 || isResending || !email}
            onPress={async () => {
              setIsResending(true)
              setError(null)
              try {
                await authService.resendVerification(email)
                setSeconds(120)
              } catch (err) {
                setError(err instanceof AuthError ? err.message : 'Could not resend the code.')
              } finally {
                setIsResending(false)
              }
            }}
          >
            <ThemedText style={{ textAlign: 'center', marginTop: 8, fontWeight: '600', color: seconds > 0 ? colors.muted : colors.tint }}>
              {isResending ? 'Sending...' : 'Resend Code'}
            </ThemedText>
          </Pressable>
        </View>
      </ScrollView>
    </ThemedView>
  )
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 22 },
  iconBox: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 14
  },
  title: { textAlign: 'center' },
  sub: { marginTop: 8, marginBottom: 20, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  errorBox: { padding: 12, borderRadius: 8, marginBottom: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 14 },
  cell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 12,
    borderWidth: 1,
    textAlign: 'center',
    fontSize: 12, 
    fontWeight: '700',
    paddingBottom: 9
  },
  progressBar: { height: 3, borderRadius: 2, marginBottom: 18, overflow: 'hidden' },
  progressFill: { height: '100%' },
  didnt: { textAlign: 'center', marginTop: 14, fontSize: 13 },
  timerRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4, marginTop: 4 },
})
