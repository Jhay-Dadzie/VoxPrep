import React, { useState } from 'react'
import { StyleSheet, View, ScrollView, Pressable, Switch } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ThemedText } from '@/components/themed-text'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { Colors } from '@/constants/theme'

export default function NotificationsSettings() {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const [push, setPush] = useState(true)
  const [email, setEmail] = useState(false)
  const [reminders, setReminders] = useState(true)
  const [feedbackAlerts, setFeedbackAlerts] = useState(true)
  const [weekly, setWeekly] = useState(false)

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
        <ThemedText style={[styles.title, { color: colors.oppositeColor }]}>Notifications</ThemedText>
        <ThemedText style={[styles.sub, { color: colors.subtext }]}>
          Manage how and when you receive updates about your interview preparation.
        </ThemedText>

        <Toggle
          card
          title="Push Notifications"
          body="Receive real-time alerts on your device"
          value={push}
          onChange={setPush}
          colors={colors}
        />
        <Toggle
          card
          title="Email Notifications"
          body="Get detailed reports and summaries via email"
          value={email}
          onChange={setEmail}
          colors={colors}
        />

        <ThemedText style={[styles.section, { color: colors.subtext }]}>ACTIVITY ALERTS</ThemedText>

        <Toggle
          card
          icon="time-outline"
          iconBg={colors.brandSoft}
          iconColor={colors.tint}
          title="Interview Reminders"
          body="Alerts for upcoming scheduled sessions"
          value={reminders}
          onChange={setReminders}
          colors={colors}
        />
        <Toggle
          card
          icon="chatbubble-ellipses"
          iconBg="#EDE9FE"
          iconColor="#7A4CF0"
          title="New Feedback Alerts"
          body="Notify when AI analysis is ready"
          value={feedbackAlerts}
          onChange={setFeedbackAlerts}
          colors={colors}
        />
        <Toggle
          card
          icon="trending-up"
          iconBg="#FEE4D6"
          iconColor="#F59E0B"
          title="Weekly Progress Reports"
          body="Consolidated summary of your performance"
          value={weekly}
          onChange={setWeekly}
          colors={colors}
        />

        <View style={[styles.smartCard, { backgroundColor: colors.brandSoft, borderColor: colors.tint }]}>
          <Ionicons name="information-circle" size={16} color={colors.tint} />
          <View style={{ flex: 1 }}>
            <ThemedText style={[styles.smartTitle, { color: colors.oppositeColor }]}>Smart Notifications</ThemedText>
            <ThemedText style={[styles.smartBody, { color: colors.subtext }]}>
              Our AI automatically adjusts the timing of your reminders based on your most active practice hours to ensure you stay productive without feeling overwhelmed.
            </ThemedText>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

function Toggle({
  title, body, value, onChange, colors, icon, iconBg, iconColor, card,
}: {
  title: string; body: string; value: boolean; onChange: (v: boolean) => void; colors: any;
  icon?: any; iconBg?: string; iconColor?: string; card?: boolean;
}) {
  return (
    <View style={[styles.toggleRow, card && { backgroundColor: colors.card }]}>
      {icon && (
        <View style={[styles.toggleIcon, { backgroundColor: iconBg }]}>
          <Ionicons name={icon} size={18} color={iconColor} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <ThemedText style={[styles.toggleTitle, { color: colors.oppositeColor }]}>{title}</ThemedText>
        <ThemedText style={[styles.toggleBody, { color: colors.subtext }]}>{body}</ThemedText>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.tint }}
        thumbColor="#fff"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1 },
  headerTitle: { fontSize: 17, fontWeight: '700' },

  title: { fontSize: 22, fontWeight: '800', marginTop: 8, marginBottom: 6 },
  sub: { fontSize: 14, lineHeight: 20, marginBottom: 16 },

  section: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginTop: 16, marginBottom: 8 },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, padding: 14, marginBottom: 10 },
  toggleIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  toggleTitle: { fontWeight: '700', fontSize: 15 },
  toggleBody: { fontSize: 12, marginTop: 2 },

  smartCard: { flexDirection: 'row', gap: 10, borderRadius: 14, padding: 14, marginTop: 16, borderWidth: 1 },
  smartTitle: { fontWeight: '700', fontSize: 14, marginBottom: 4 },
  smartBody: { fontSize: 12, lineHeight: 17 },
})
