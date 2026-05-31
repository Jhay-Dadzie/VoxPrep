import { StyleSheet, ScrollView, View } from 'react-native'
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

export default function ResetPassword() {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const [pw, setPw] = useState('')
  const [cpw, setCpw] = useState('')

  const hasLen = pw.length >= 8
  const hasNum = /\d/.test(pw)
  const hasSym = /[^A-Za-z0-9]/.test(pw)
  const strength = (hasLen ? 1 : 0) + (hasNum ? 1 : 0) + (hasSym ? 1 : 0)
  const labels = ['', 'Weak', 'Medium', 'Strong']
  const canSubmit = strength === 3 && pw === cpw

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

        <Button action={() => router.replace('/(authScreens)/signin')} disabled={!canSubmit}>
          <ThemedText type='placeholderText'>Update Password</ThemedText>
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
  strengthCard: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 14 },
  strengthHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  strengthBarBg: { flex: 1, height: 6, borderRadius: 3, marginRight: 10, overflow: 'hidden' },
  strengthFill: { height: '100%' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 4 },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 24 },
})
