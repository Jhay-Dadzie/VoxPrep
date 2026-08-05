import React, { useState } from 'react'
import { StyleSheet, View, ScrollView, Image, Pressable, Switch } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ThemedText } from '@/components/themed-text'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { useThemeOverride } from '@/hooks/theme-context'
import { Colors } from '@/constants/theme'

const AVATAR = 'https://i.pravatar.cc/200?img=12'

export default function Profile() {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const { setOverride } = useThemeOverride()
  const dark = colorScheme === 'dark'

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.card }} edges={['top']}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.canGoBack() && router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={colors.tint} />
        </Pressable>
        <ThemedText style={[styles.headerTitle, { color: colors.tint }]}>Profile</ThemedText>
        <View style={{ flex: 1 }} />
        <Pressable hitSlop={10}>
          <Ionicons name="settings-sharp" size={20} color={colors.tint} />
        </Pressable>
      </View>

      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.identity}>
          <View style={styles.avatarWrap}>
            <Image source={{ uri: AVATAR }} style={styles.avatar} />
            <View style={[styles.editBadge, { backgroundColor: colors.tint, borderColor: colors.background }]}>
              <Ionicons name="pencil" size={11} color="#fff" />
            </View>
          </View>
          <ThemedText style={[styles.name, { color: colors.oppositeColor }]}>Alex Johnson</ThemedText>
          <ThemedText style={[styles.email, { color: colors.subtext }]}>alex.johnson@corporate.ai</ThemedText>
        </View>

        <SectionTitle text="Account Settings" color={colors.oppositeColor} />
        <View style={[styles.group, { backgroundColor: colors.card }]}>
          <Row
            icon="person-outline"
            label="Personal Info"
            colors={colors}
            onPress={() => router.push('/settings/personal-info')}
          />
          <Divider color={colors.divider} />
          <Row
            icon="lock-closed-outline"
            label="Change Password"
            colors={colors}
            onPress={() => router.push('/settings/change-password')}
          />
        </View>

        <SectionTitle text="App Preferences" color={colors.oppositeColor} />
        <View style={[styles.group, { backgroundColor: colors.card }]}>
          <Row
            icon="notifications-outline"
            label="Notifications"
            colors={colors}
            onPress={() => router.push('/settings/notifications')}
          />
          <Divider color={colors.divider} />
          <Row
            icon="moon-outline"
            label="Dark Mode"
            colors={colors}
            right={
              <Switch
                value={dark}
                onValueChange={(v) => setOverride(v ? 'dark' : 'light')}
                trackColor={{ false: colors.border, true: colors.tint }}
                thumbColor="#fff"
              />
            }
          />
        </View>

        <SectionTitle text="Subscription" color={colors.oppositeColor} />
        <View style={[styles.group, { backgroundColor: colors.card }]}>
          <Row
            icon="ribbon-outline"
            label="Current Plan"
            colors={colors}
            right={
              <View style={[styles.proPill, { backgroundColor: colors.brandSoft }]}>
                <ThemedText style={[styles.proPillText, { color: '#7A4CF0' }]}>Pro</ThemedText>
              </View>
            }
          />
        </View>

        <SectionTitle text="Support" color={colors.oppositeColor} />
        <View style={[styles.group, { backgroundColor: colors.card }]}>
          <Row icon="help-circle-outline" label="Help Center" colors={colors} onPress={() => {}} />
          <Divider color={colors.divider} />
          <Row icon="chatbubble-ellipses-outline" label="Feedback" colors={colors} onPress={() => {}} />
        </View>

        <Pressable style={styles.logout} onPress={() => router.replace('/(authScreens)/signin')}>
          <Ionicons name="log-out-outline" size={18} color={colors.danger} />
          <ThemedText style={[styles.logoutText, { color: colors.danger }]}>Logout</ThemedText>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  )
}

function SectionTitle({ text, color }: { text: string; color: string }) {
  return <ThemedText style={[styles.sectionTitle, { color }]}>{text}</ThemedText>
}

function Divider({ color }: { color: string }) {
  return <View style={{ height: 1, backgroundColor: color, marginLeft: 48 }} />
}

function Row({
  icon, label, colors, onPress, right,
}: { icon: any; label: string; colors: any; onPress?: () => void; right?: React.ReactNode }) {
  return (
    <Pressable style={styles.row} onPress={onPress} disabled={!onPress}>
      <Ionicons name={icon} size={20} color={colors.oppositeColor} />
      <ThemedText style={[styles.rowLabel, { color: colors.oppositeColor }]}>{label}</ThemedText>
      {right ?? <Ionicons name="chevron-forward" size={18} color={colors.muted} />}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1 },
  headerTitle: { fontSize: 17, fontWeight: '700' },

  identity: { alignItems: 'center', marginTop: 8, marginBottom: 22 },
  avatarWrap: { width: 84, height: 84, marginBottom: 10 },
  avatar: { width: 84, height: 84, borderRadius: 42 },
  editBadge: {
    position: 'absolute', right: -2, bottom: -2,
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2,
  },
  name: { fontSize: 18, fontWeight: '700' },
  email: { fontSize: 13, marginTop: 2 },

  sectionTitle: { fontSize: 15, fontWeight: '700', marginTop: 14, marginBottom: 8 },
  group: { borderRadius: 14, overflow: 'hidden' },

  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 14 },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: '500' },

  proPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6 },
  proPillText: { fontSize: 12, fontWeight: '700' },

  logout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 28 },
  logoutText: { fontWeight: '700', fontSize: 15 },
})
