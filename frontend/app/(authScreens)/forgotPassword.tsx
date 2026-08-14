import { StyleSheet, ScrollView, View, Pressable, Alert } from 'react-native'
import React, { useState } from 'react'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { ThemedText } from '@/components/themed-text'
import { ThemedView } from '@/components/themed-view'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { Colors } from '@/constants/theme'
import { GlobalStyles } from '@/components/styles/globalStyles'
import Button from '@/components/button'
import Input from '@/components/input'
import { authService } from '@/services/auth'
import { toAuthError } from '@/services/error-handler'

export default function ForgotPassword() {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSendReset = async () => {
    if (!email) return
    setIsLoading(true)
    setError(null)
    try {
      await authService.forgotPassword({ email })
      Alert.alert(
        'Verification Code Sent',
        'Check your email for the eight-digit verification code, then enter it in VoxPrep.',
        [{
          text: 'Enter Code',
          onPress: () => router.replace({
            pathname: '/(authScreens)/resetPasswordOtp',
            params: { email },
          }),
        }]
      )
    } catch (err) {
      setError(toAuthError(err).message)
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
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={[styles.iconBox, { backgroundColor: colors.brandSoft }]}>
            <Ionicons name='lock-open' size={24} color={colors.tint} />
          </View>
          <ThemedText type='title' style={[styles.title, { color: colors.oppositeColor }]}>Reset Your Password</ThemedText>
          <ThemedText style={[styles.sub, { color: colors.subtext }]}>
            Enter the email address associated with your account and we&apos;ll send you a six-digit reset code.
          </ThemedText>

          {error && (
            <View style={[styles.errorBox, { backgroundColor: colors.dangerBg }]}>
              <ThemedText style={{ color: colors.danger, fontSize: 13 }}>{error}</ThemedText>
            </View>
          )}

          <Input
            label='Email Address'
            placeholder='name@company.com'
            rightIcon='mail-outline'
            value={email}
            onChangeText={setEmail}
            keyboardType='email-address'
            autoCapitalize='none'
            helper='Check your inbox or spam folder for the reset link.'
          />

          <Button action={handleSendReset} disabled={!email || isLoading}>
            <ThemedText type='placeholderText'>
              {isLoading ? 'Sending...' : 'Send Reset Link'}
            </ThemedText>
          </Button>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name='arrow-back' size={16} color={colors.tint} />
            <ThemedText style={{ color: colors.tint, fontWeight: '600' }}>Back to Login</ThemedText>
          </Pressable>
        </View>
      </ScrollView>
    </ThemedView>
  )
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 22, marginTop: 20 },
  iconBox: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 12 },
  title: { textAlign: 'center' },
  sub: { marginTop: 8, marginBottom: 20, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  errorBox: { padding: 12, borderRadius: 8, marginBottom: 16 },
  divider: { height: 1, marginVertical: 16 },
  backBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
})
