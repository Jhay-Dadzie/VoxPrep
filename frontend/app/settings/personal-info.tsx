import React, { useState } from 'react'
import { StyleSheet, View, ScrollView, Image, Pressable, TextInput } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ThemedText } from '@/components/themed-text'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { Colors } from '@/constants/theme'

const AVATAR = 'https://i.pravatar.cc/200?img=12'

export default function PersonalInfo() {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const [name, setName] = useState('Alex Henderson')
  const [email, setEmail] = useState('alex.henderson@example.com')
  const [phone, setPhone] = useState('+1 (555) 000-1234')

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

        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Field label="Full Name" value={name} onChangeText={setName} colors={colors} />
          <Field label="Email Address" value={email} onChangeText={setEmail} colors={colors} keyboardType="email-address" />
          <Field label="Phone Number" value={phone} onChangeText={setPhone} colors={colors} keyboardType="phone-pad" last />
        </View>

        <View style={[styles.infoBox, { backgroundColor: colors.brandSoft }]}>
          <Ionicons name="information-circle" size={16} color={colors.tint} />
          <ThemedText style={[styles.infoText, { color: colors.subtext }]}>
            Your contact details are used for scheduling mock interview sessions and sending feedback reports.
          </ThemedText>
        </View>

        <Pressable style={[styles.save, { backgroundColor: colors.tint }]} onPress={() => router.back()}>
          <ThemedText style={styles.saveText}>Save Changes</ThemedText>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  )
}

function Field({
  label, value, onChangeText, colors, keyboardType, last,
}: { label: string; value: string; onChangeText: (s: string) => void; colors: any; keyboardType?: any; last?: boolean }) {
  return (
    <View style={{ marginBottom: last ? 0 : 14 }}>
      <ThemedText style={[styles.fieldLabel, { color: colors.subtext }]}>{label}</ThemedText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        style={[styles.input, { backgroundColor: colors.inputBg, color: colors.oppositeColor, borderColor: colors.border }]}
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

  save: { borderRadius: 999, paddingVertical: 16, alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 15 },
})
