import React, { useState, useEffect } from 'react'
import { StyleSheet, View, ScrollView, Image, Pressable, TextInput, Alert } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ThemedText } from '@/components/themed-text'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { Colors } from '@/constants/theme'
import { useAuth } from '@/hooks/auth-context'
import { userService } from '@/services/user'
import { toAuthError } from '@/services/error-handler'

const AVATAR = 'https://i.pravatar.cc/200?img=12'

export default function PersonalInfo() {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const { user, updateUser } = useAuth()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasChanges, setHasChanges] = useState(false)

  // Initialize fields with user data
  useEffect(() => {
    if (user) {
      setName(user.full_name || '')
      setEmail(user.email)
    }
  }, [user])

  const handleNameChange = (text: string) => {
    setName(text)
    setHasChanges(text !== (user?.full_name || ''))
  }

  const handleSave = async () => {
    if (!hasChanges) {
      router.back()
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      await userService.updateProfile({
        full_name: name,
      })

      // Update auth context with new user data
      await updateUser({ full_name: name })

      Alert.alert('Success', 'Profile updated successfully', [
        { text: 'OK', onPress: () => router.back() },
      ])
    } catch (err) {
      setError(toAuthError(err).message)
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
        <View style={styles.avatarRow}>
          <View style={styles.avatarWrap}>
            <Image source={{ uri: AVATAR }} style={styles.avatar} />
            <View style={[styles.editBadge, { backgroundColor: colors.tint, borderColor: colors.background }]}>
              <Ionicons name="pencil" size={12} color="#fff" />
            </View>
          </View>
        </View>

        <ThemedText style={[styles.title, { color: colors.oppositeColor }]}>Personal Information</ThemedText>
        <ThemedText style={[styles.sub, { color: colors.subtext }]}>
          Update your personal details to personalize your coaching experience.
        </ThemedText>

        {error && (
          <View style={[styles.errorBox, { backgroundColor: colors.dangerBg }]}>
            <Ionicons name="alert-circle" size={16} color={colors.danger} />
            <ThemedText style={[styles.errorText, { color: colors.danger }]}>{error}</ThemedText>
          </View>
        )}

        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Field
            label="Full Name"
            value={name}
            onChangeText={handleNameChange}
            colors={colors}
            editable={true}
          />
          <Field
            label="Email Address"
            value={email}
            onChangeText={() => {}}
            colors={colors}
            keyboardType="email-address"
            editable={false}
            last
          />
        </View>

        <View style={[styles.infoBox, { backgroundColor: colors.brandSoft }]}>
          <Ionicons name="information-circle" size={16} color={colors.tint} />
          <ThemedText style={[styles.infoText, { color: colors.subtext }]}>
            Your email address cannot be changed. For account security, contact support if you need to update it.
          </ThemedText>
        </View>

        <Pressable
          style={[styles.save, { backgroundColor: hasChanges ? colors.tint : colors.muted }]}
          onPress={handleSave}
          disabled={isSaving}
        >
          <ThemedText style={styles.saveText}>
            {isSaving ? 'Saving...' : 'Save Changes'}
          </ThemedText>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  )
}

function Field({
  label, value, onChangeText, colors, keyboardType, last, editable = true,
}: { label: string; value: string; onChangeText: (s: string) => void; colors: any; keyboardType?: any; last?: boolean; editable?: boolean }) {
  return (
    <View style={{ marginBottom: last ? 0 : 14 }}>
      <ThemedText style={[styles.fieldLabel, { color: colors.subtext }]}>{label}</ThemedText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        editable={editable}
        style={[
          styles.input,
          {
            backgroundColor: editable ? colors.inputBg : colors.brandSoft,
            color: colors.oppositeColor,
            borderColor: colors.border,
            opacity: editable ? 1 : 0.6,
          },
        ]}
        placeholderTextColor={colors.muted}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1 },
  headerTitle: { fontSize: 17, fontWeight: '700' },

  avatarRow: { alignItems: 'center', marginTop: 8, marginBottom: 18 },
  avatarWrap: { width: 84, height: 84 },
  avatar: { width: 84, height: 84, borderRadius: 42 },
  editBadge: {
    position: 'absolute', right: -2, bottom: -2,
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2,
  },

  title: { fontSize: 20, fontWeight: '800', marginBottom: 6 },
  sub: { fontSize: 14, lineHeight: 20, marginBottom: 18 },

  card: { borderRadius: 14, padding: 16, marginBottom: 14 },
  fieldLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  input: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 12, fontSize: 14 },

  infoBox: { flexDirection: 'row', gap: 10, borderRadius: 12, padding: 14, marginBottom: 24 },
  infoText: { flex: 1, fontSize: 13, lineHeight: 18 },

  errorBox: { flexDirection: 'row', gap: 10, borderRadius: 12, padding: 12, marginBottom: 16 },
  errorText: { flex: 1, fontSize: 13, lineHeight: 18 },

  save: { borderRadius: 999, paddingVertical: 16, alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 15 },
})
