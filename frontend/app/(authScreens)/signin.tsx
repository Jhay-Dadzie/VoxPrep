import { StyleSheet, ScrollView, Pressable, View } from 'react-native'
import React, { useEffect, useState } from 'react'
import { router, Link } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { ThemedText } from '@/components/themed-text'
import { ThemedView } from '@/components/themed-view'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { Colors } from '@/constants/theme'
import { GlobalStyles } from '@/components/styles/globalStyles'
import Button from '@/components/button'
import Input from '@/components/input'
import { useAuth } from '@/hooks/auth-context'
import { getFieldError } from '@/services/error-handler'

export default function Signin() {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const { login, googleSignIn, isLoading, isInitializing, user, error, clearError } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  useEffect(() => {
    if (!isInitializing && !isLoading && user) {
      router.replace(user.profile_completed ? '/(tabs)/dashboard' : '/mode-select')
    }
  }, [isInitializing, isLoading, user])

  const handleLogin = async () => {
    try {
      clearError()
      await login(email, password)
    } catch (err) {
      console.error('Login failed:', err)
    }
  }

  const handleGoogleSignIn = async () => {
    try {
      clearError()
      await googleSignIn()
    } catch (err) {
      console.error('Google signin failed:', err)
    }
  }

  return (
    <ThemedView style={[GlobalStyles.container, { flex: 1 }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 24, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ alignItems: 'center', marginBottom: 24 }}>
          <ThemedText type='title' style={{ color: colors.tint }}>VoxPrep</ThemedText>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <ThemedText type='title' style={{ color: colors.oppositeColor }}>Welcome Back</ThemedText>
          <ThemedText style={{ color: colors.subtext, marginTop: 4, marginBottom: 20, fontSize: 13 }}>
            Please enter your details to continue your journey.
          </ThemedText>

          {error && !error.field && !error.details && (
            <View style={[styles.errorBox, { backgroundColor: colors.dangerBg }]}>
              <ThemedText style={{ color: colors.danger, fontSize: 13 }}>{error.message}</ThemedText>
            </View>
          )}

          <Input
            label='Email address'
            icon='mail-outline'
            placeholder='name@company.com'
            value={email}
            onChangeText={setEmail}
            keyboardType='email-address'
            autoCapitalize='none'
            error={getFieldError(error as any, 'email')}
          />
          <Input
            label='Password'
            icon='lock-closed-outline'
            placeholder='••••••••'
            value={password}
            onChangeText={setPassword}
            password
            error={getFieldError(error as any, 'password')}
          />

          <Pressable onPress={() => router.push('/(authScreens)/forgotPassword')} style={{ alignSelf: 'flex-end', marginBottom: 16 }}>
            <ThemedText style={{ color: colors.tint, fontWeight: '600', fontSize: 13 }}>Forgot password?</ThemedText>
          </Pressable>

          <Button action={handleLogin} disabled={isLoading}>
            <ThemedText type='placeholderText'>{isLoading ? 'Signing in...' : 'Login'}</ThemedText>
          </Button>

          <View style={styles.divider}>
            <View style={[styles.line, { backgroundColor: colors.border }]} />
            <ThemedText style={[styles.dividerText, { color: colors.muted }]}>OR CONTINUE WITH</ThemedText>
            <View style={[styles.line, { backgroundColor: colors.border }]} />
          </View>

          <View style={styles.social}>
            <Pressable
              style={[styles.socialBtn, { borderColor: colors.border }]}
              onPress={handleGoogleSignIn}
              disabled={isLoading}
            >
              <Ionicons name='logo-google' size={20} color={colors.oppositeColor} />
            </Pressable>
            <Pressable style={[styles.socialBtn, { borderColor: colors.border }]}>
              <Ionicons name='logo-apple' size={20} color={colors.oppositeColor} />
            </Pressable>
          </View>

          <View style={styles.bottom}>
            <ThemedText style={{ color: colors.subtext }}>Don't have an account? </ThemedText>
            <Link href='/(authScreens)/signup'>
              <ThemedText style={{ color: colors.tint, fontWeight: '600' }}>Sign Up</ThemedText>
            </Link>
          </View>
        </View>
      </ScrollView>
    </ThemedView>
  )
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 22 },
  errorBox: { padding: 12, borderRadius: 8, marginBottom: 16 },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 18 },
  line: { flex: 1, height: 1 },
  dividerText: { fontSize: 11, marginHorizontal: 8, letterSpacing: 1 },
  social: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  socialBtn: { flex: 1, height: 48, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  bottom: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
})
