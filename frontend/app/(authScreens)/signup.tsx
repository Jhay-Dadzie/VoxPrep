import { StyleSheet, ScrollView, Pressable, View } from 'react-native'
import React, { useEffect, useState } from 'react'
import { Link, router } from 'expo-router'
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

export default function Signup() {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const { signup, googleSignIn, isLoading, isInitializing, user, error, clearError } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [cpw, setCpw] = useState('')
  const [agree, setAgree] = useState(false)

  useEffect(() => {
    if (!isInitializing && !isLoading && user) {
      router.replace(user.profile_completed ? '/(tabs)/dashboard' : '/mode-select')
    }
  }, [isInitializing, isLoading, user])

  const pwError = pw.length > 0 && pw.length < 8 ? 'Password must be at least 8 characters.' : getFieldError(error as any, 'password')
  const confirmPwError = pw !== cpw && cpw.length > 0 ? 'Passwords do not match.' : undefined

  const handleSignup = async () => {
    if (pw !== cpw) {
      return
    }
    try {
      clearError()
      const result = await signup(email, pw, name)
      if (result.requiresVerification) {
        router.replace({
          pathname: '/(authScreens)/verify-email',
          params: { email },
        })
      }
    } catch (err) {
      console.error('Signup failed:', err)
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
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={[styles.iconBox, { backgroundColor: colors.tint }]}>
            <Ionicons name='sparkles' size={26} color='#fff' />
          </View>
          <ThemedText type='title' style={[styles.title, { color: colors.oppositeColor }]}>Create Your Account</ThemedText>
          <ThemedText style={[styles.sub, { color: colors.subtext }]}>
            Join thousands of professionals mastering their interview skills.
          </ThemedText>

          {error && !error.field && !error.details && (
            <View style={[styles.errorBox, { backgroundColor: colors.dangerBg }]}>
              <ThemedText style={{ color: colors.danger, fontSize: 13 }}>{error.message}</ThemedText>
            </View>
          )}

          <Input
            label='Full Name'
            placeholder='Enter your full name'
            value={name}
            onChangeText={setName}
            error={getFieldError(error as any, 'full_name')}
          />
          <Input
            label='Email Address'
            placeholder='name@company.com'
            value={email}
            onChangeText={setEmail}
            keyboardType='email-address'
            autoCapitalize='none'
            error={getFieldError(error as any, 'email')}
          />
          <Input label='Password' placeholder='••••••••' password value={pw} onChangeText={setPw} error={pwError} />
          <Input label='Confirm Password' placeholder='••••••••' password value={cpw} onChangeText={setCpw} error={confirmPwError} />

          <Pressable style={styles.checkRow} onPress={() => setAgree(a => !a)}>
            <View
              style={[
                styles.checkbox,
                { borderColor: colors.border },
                agree && { backgroundColor: colors.tint, borderColor: colors.tint },
              ]}
            >
              {agree && <Ionicons name='checkmark' size={14} color='#fff' />}
            </View>
            <ThemedText style={[styles.checkText, { color: colors.subtext }]}>
              I agree to the <ThemedText style={{ color: colors.tint, fontWeight: '600' }}>Terms of Service</ThemedText> and{' '}
              <ThemedText style={{ color: colors.tint, fontWeight: '600' }}>Privacy Policy</ThemedText>.
            </ThemedText>
          </Pressable>

          <Button action={handleSignup} disabled={!agree || isLoading || pw !== cpw}>
            <ThemedText type='placeholderText'>{isLoading ? 'Creating account...' : 'Sign Up'}</ThemedText>
          </Button>

          <View style={styles.divider}>
            <View style={[styles.line, { backgroundColor: colors.border }]} />
            <ThemedText style={[styles.dividerText, { color: colors.muted }]}>Or continue with</ThemedText>
            <View style={[styles.line, { backgroundColor: colors.border }]} />
          </View>

          <View style={styles.social}>
            <Pressable
              style={[styles.socialBtn, { borderColor: colors.border }]}
              onPress={handleGoogleSignIn}
              disabled={isLoading}
            >
              <Ionicons name='logo-google' size={18} color={colors.oppositeColor} />
              <ThemedText style={[styles.socialText, { color: colors.oppositeColor }]}>Google</ThemedText>
            </Pressable>
            <Pressable style={[styles.socialBtn, { borderColor: colors.border }]}>
              <Ionicons name='logo-apple' size={18} color={colors.oppositeColor} />
              <ThemedText style={[styles.socialText, { color: colors.oppositeColor }]}>Apple</ThemedText>
            </Pressable>
          </View>

          <View style={styles.bottom}>
            <ThemedText style={{ color: colors.subtext }}>Already have an account? </ThemedText>
            <Link href='/(authScreens)/signin'>
              <ThemedText style={{ color: colors.tint, fontWeight: '600' }}>Login</ThemedText>
            </Link>
          </View>
        </View>
      </ScrollView>
    </ThemedView>
  )
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: 22 },
  iconBox: { width: 56, height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 14 },
  title: { textAlign: 'center' },
  sub: { marginTop: 6, marginBottom: 20, fontSize: 14, textAlign: 'center' },
  errorBox: { padding: 12, borderRadius: 8, marginBottom: 16 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16, marginTop: 4 },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, marginRight: 10, marginTop: 2, alignItems: 'center', justifyContent: 'center' },
  checkText: { flex: 1, fontSize: 13, lineHeight: 18 },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 18 },
  line: { flex: 1, height: 1 },
  dividerText: { fontSize: 12, marginHorizontal: 10 },
  social: { flexDirection: 'row', gap: 10 },
  socialBtn: { flex: 1, flexDirection: 'row', height: 48, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  socialText: { fontWeight: '600' },
  bottom: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
})
