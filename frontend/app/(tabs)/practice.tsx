import React, { useState } from 'react'
import { StyleSheet, View, ScrollView, Image, Pressable, TextInput } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ThemedText } from '@/components/themed-text'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { Colors } from '@/constants/theme'

const AVATAR = 'https://i.pravatar.cc/100?img=12'

export default function Practice() {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const [tab, setTab] = useState<'paste' | 'upload'>('paste')
  const [text, setText] = useState('')

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Image source={{ uri: AVATAR }} style={styles.avatar} />
        <ThemedText style={[styles.brand, { color: colors.tint }]}>VoxPrep</ThemedText>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        <ThemedText style={[styles.title, { color: colors.oppositeColor }]}>
          What role are you{'\n'}interviewing{'\n'}for?
        </ThemedText>
        <ThemedText style={[styles.sub, { color: colors.subtext }]}>
          AI needs the context of the job description to generate high-relevance interview questions tailored to your target position.
        </ThemedText>

        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
            <Pressable
              style={[styles.tab, { borderBottomColor: tab === 'paste' ? colors.tint : 'transparent' }]}
              onPress={() => setTab('paste')}
            >
              <Ionicons name="clipboard-outline" size={16} color={tab === 'paste' ? colors.tint : colors.subtext} />
              <ThemedText style={{ color: tab === 'paste' ? colors.tint : colors.subtext, fontWeight: '600' }}>Paste Text</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.tab, { borderBottomColor: tab === 'upload' ? colors.tint : 'transparent' }]}
              onPress={() => setTab('upload')}
            >
              <Ionicons name="cloud-upload-outline" size={16} color={tab === 'upload' ? colors.tint : colors.subtext} />
              <ThemedText style={{ color: tab === 'upload' ? colors.tint : colors.subtext, fontWeight: '600' }}>Upload File</ThemedText>
            </Pressable>
          </View>

          {tab === 'paste' ? (
            <View style={[styles.textareaWrap, { backgroundColor: colors.inputBg }]}>
              <TextInput
                multiline
                value={text}
                onChangeText={(v) => setText(v.slice(0, 5000))}
                placeholder="Paste the full job description here including responsibilities, requirements, and about the company..."
                placeholderTextColor={colors.muted}
                style={[styles.textarea, { color: colors.oppositeColor }]}
                textAlignVertical="top"
              />
              <View style={styles.textareaFooter}>
                <ThemedText style={{ color: colors.muted, fontSize: 12 }}>Minimum 200 characters recommended</ThemedText>
                <View style={[styles.counterPill, { backgroundColor: colors.card }]}>
                  <ThemedText style={{ color: colors.oppositeColor, fontWeight: '600', fontSize: 12 }}>
                    {text.length} / <ThemedText style={{ color: colors.muted }}>5000</ThemedText>
                  </ThemedText>
                </View>
              </View>
            </View>
          ) : (
            <Pressable style={[styles.uploadBox, { borderColor: colors.border }]}>
              <Ionicons name="cloud-upload-outline" size={36} color={colors.tint} />
              <ThemedText style={{ color: colors.oppositeColor, fontWeight: '600', marginTop: 6 }}>Upload PDF or DOCX</ThemedText>
              <ThemedText style={{ color: colors.muted, fontSize: 13 }}>Tap to choose a file from your device</ThemedText>
            </Pressable>
          )}

          <View style={styles.infoRow}>
            <Ionicons name="information-circle" size={16} color={colors.tint} />
            <ThemedText style={{ color: colors.subtext, fontSize: 12, flex: 1 }}>
              AI will analyze tone, keywords, and technical requirements.
            </ThemedText>
          </View>

          <Pressable style={[styles.cta, { backgroundColor: colors.tint }]} onPress={() => router.push('/countdown')}>
            <ThemedText style={styles.ctaText}>Generate Questions</ThemedText>
            <Ionicons name="sparkles" size={16} color="#fff" />
          </Pressable>
        </View>

        <LinearGradient
          colors={[colors.tint, '#7A4CF0']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.promo}
        >
          <ThemedText style={styles.promoTitle}>Ready to master your next interview?</ThemedText>
          <ThemedText style={styles.promoBody}>Start a mock interview with real-time audio feedback.</ThemedText>
          <Pressable style={[styles.quickStart, { backgroundColor: colors.card }]} onPress={() => router.push('/countdown')}>
            <ThemedText style={{ color: colors.tint, fontWeight: '700' }}>Quick Start</ThemedText>
          </Pressable>
          <Ionicons name="settings" size={88} color="#ffffff20" style={styles.promoIcon} />
        </LinearGradient>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1 },
  avatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10 },
  brand: { fontWeight: '700', fontSize: 17 },

  title: { fontSize: 28, fontWeight: '800', marginTop: 10, lineHeight: 34 },
  sub: { fontSize: 14, marginTop: 12, marginBottom: 22, lineHeight: 20 },

  card: { borderRadius: 12, padding: 18, marginBottom: 20 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, marginBottom: 18 },
  tab: { flex: 1, paddingVertical: 12, flexDirection: 'row', justifyContent: 'center', gap: 6, borderBottomWidth: 2 },

  textareaWrap: { borderRadius: 12, padding: 14, minHeight: 240 },
  textarea: { flex: 1, minHeight: 190, fontSize: 14, lineHeight: 20 },
  textareaFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  counterPill: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },

  uploadBox: { borderWidth: 2, borderStyle: 'dashed', borderRadius: 12, padding: 56, alignItems: 'center', gap: 6, minHeight: 240, justifyContent: 'center' },

  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, marginBottom: 16 },

  cta: { borderRadius: 999, height: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  ctaText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  promo: { borderRadius: 12, padding: 20, overflow: 'hidden', position: 'relative' },
  promoTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  promoBody: { color: '#ffffffcc', marginBottom: 14, fontSize: 13 },
  quickStart: { alignSelf: 'flex-start', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999 },
  promoIcon: { position: 'absolute', right: -10, bottom: -10 },
})
