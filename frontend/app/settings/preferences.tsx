import React from 'react'
import { StyleSheet, View, ScrollView, Pressable } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ThemedText } from '@/components/themed-text'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { useMode } from '@/hooks/mode-context'
import { useInterviewer } from '@/hooks/interviewer-context'
import { Colors } from '@/constants/theme'
import { MODE_LIST } from '@/constants/modes'

/**
 * Practice preferences — change the default mode without logging out.
 *
 * The login flow still walks through mode-select and interviewer-select, but
 * this is the shortcut for someone who just wants to switch and carry on. It
 * writes to the same persisted context, so the pickers show the new choice
 * pre-selected next time.
 */
export default function Preferences() {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const { modeId, setMode } = useMode()
  const { interviewer } = useInterviewer()

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.card }} edges={['top']}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={22} color={colors.tint} />
        </Pressable>
        <ThemedText style={[styles.headerTitle, { color: colors.tint }]}>Settings</ThemedText>
      </View>

      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ padding: 20, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        <ThemedText style={[styles.title, { color: colors.oppositeColor }]}>
          Practice Preferences
        </ThemedText>
        <ThemedText style={[styles.sub, { color: colors.subtext }]}>
          Changing your mode reshapes the questions you get, the wording across the app, and how your
          answers are scored.
        </ThemedText>

        <ThemedText style={[styles.sectionTitle, { color: colors.oppositeColor }]}>
          Default Mode
        </ThemedText>
        <View style={[styles.group, { backgroundColor: colors.card }]}>
          {MODE_LIST.map((mode, i) => {
            const isActive = mode.id === modeId
            return (
              <View key={mode.id}>
                {i > 0 && <View style={{ height: 1, backgroundColor: colors.divider, marginLeft: 56 }} />}
                <Pressable
                  style={styles.modeRow}
                  onPress={() => setMode(mode.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isActive }}
                >
                  <View
                    style={[
                      styles.modeIcon,
                      { backgroundColor: isActive ? colors.tint : colors.brandSoft },
                    ]}
                  >
                    <Ionicons
                      name={mode.icon as any}
                      size={18}
                      color={isActive ? '#fff' : colors.tint}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={[styles.modeLabel, { color: colors.oppositeColor }]}>
                      {mode.label}
                    </ThemedText>
                    <ThemedText style={[styles.modeTagline, { color: colors.subtext }]}>
                      {mode.tagline}
                    </ThemedText>
                  </View>
                  <Ionicons
                    name={isActive ? 'checkmark-circle' : 'ellipse-outline'}
                    size={20}
                    color={isActive ? colors.tint : colors.muted}
                  />
                </Pressable>
              </View>
            )
          })}
        </View>

        <ThemedText style={[styles.sectionTitle, { color: colors.oppositeColor }]}>
          Interviewer
        </ThemedText>
        <View style={[styles.group, { backgroundColor: colors.card }]}>
          <Pressable style={styles.row} onPress={() => router.push('/interviewer-select')}>
            <Ionicons name={interviewer.icon as any} size={20} color={colors.oppositeColor} />
            <View style={{ flex: 1 }}>
              <ThemedText style={[styles.rowLabel, { color: colors.oppositeColor }]}>
                {interviewer.label}
              </ThemedText>
              <ThemedText style={[styles.rowSub, { color: colors.subtext }]}>
                {interviewer.members.length === 1
                  ? interviewer.members[0].name
                  : `${interviewer.members.length} panellists`}
              </ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        </View>

        <ThemedText style={[styles.sectionTitle, { color: colors.oppositeColor }]}>
          Export
        </ThemedText>
        <View style={[styles.group, { backgroundColor: colors.card }]}>
          <View style={styles.row}>
            <Ionicons name="document-text-outline" size={20} color={colors.muted} />
            <View style={{ flex: 1 }}>
              <ThemedText style={[styles.rowLabel, { color: colors.muted }]}>
                Export feedback as PDF
              </ThemedText>
              <ThemedText style={[styles.rowSub, { color: colors.muted }]}>
                Needs saved sessions on the server
              </ThemedText>
            </View>
            <View style={[styles.soonPill, { backgroundColor: colors.brandSoft }]}>
              <ThemedText style={[styles.soonText, { color: colors.tint }]}>Soon</ThemedText>
            </View>
          </View>
        </View>

        <View style={[styles.note, { backgroundColor: colors.inputBg }]}>
          <Ionicons name="information-circle" size={16} color={colors.tint} />
          <ThemedText style={{ color: colors.subtext, fontSize: 12, flex: 1, lineHeight: 18 }}>
            Export is disabled until feedback is stored server-side — there is nothing to put in the
            file yet.
          </ThemedText>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1 },
  headerTitle: { fontSize: 17, fontWeight: '700' },

  title: { fontSize: 22, fontWeight: '800', marginTop: 4 },
  sub: { fontSize: 13, lineHeight: 19, marginTop: 8 },

  sectionTitle: { fontSize: 15, fontWeight: '700', marginTop: 22, marginBottom: 8 },
  group: { borderRadius: 14, overflow: 'hidden' },

  modeRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 14 },
  modeIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  modeLabel: { fontSize: 15, fontWeight: '600' },
  modeTagline: { fontSize: 12, marginTop: 2, lineHeight: 16 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 14 },
  rowLabel: { fontSize: 15, fontWeight: '500' },
  rowSub: { fontSize: 12, marginTop: 2 },

  soonPill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 6 },
  soonText: { fontSize: 11, fontWeight: '700' },

  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 10, padding: 12, marginTop: 14 },
})
