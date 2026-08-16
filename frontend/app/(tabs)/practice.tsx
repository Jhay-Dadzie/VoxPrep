import React, { useState } from 'react'
import { StyleSheet, View, ScrollView, Pressable, TextInput, ActivityIndicator } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import * as DocumentPicker from 'expo-document-picker'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ThemedText } from '@/components/themed-text'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { useMode } from '@/hooks/mode-context'
import { useAuth } from '@/hooks/auth-context'
import { Colors } from '@/constants/theme'
import { interviewService } from '@/services/interview'
import { setPreparedSession } from '@/lib/prepared-session'
import type { PickedDocument } from '@/types/interview'

const MAX_CHARS = 5000

/** Mirrors the fileFilter on the backend's upload middleware. */
const ACCEPTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]

const formatSize = (bytes?: number) => {
  if (!bytes) return ''
  const kb = bytes / 1024
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`
}

export default function Practice() {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const { modeId, mode, copy } = useMode()
  const { user } = useAuth()

  const [tab, setTab] = useState<'paste' | 'upload'>('paste')
  const [text, setText] = useState('')
  const [document, setDocument] = useState<PickedDocument | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const source = mode.source
  const hasEnoughText = text.trim().length >= source.minLength
  const canGenerate = !isGenerating && (tab === 'paste' ? hasEnoughText : !!document)

  const pickDocument = async () => {
    setError(null)
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ACCEPTED_TYPES,
        copyToCacheDirectory: true,
      })
      if (result.canceled || !result.assets?.length) return

      const asset = result.assets[0]
      setDocument({
        uri: asset.uri,
        name: asset.name,
        // Some Android providers return no mimeType; the server also sniffs by
        // extension, so a sensible default is enough to get the upload through.
        mimeType: asset.mimeType ?? 'application/octet-stream',
        size: asset.size ?? undefined,
      })
    } catch {
      setError('Could not open that file. Try a different one.')
    }
  }

  const generate = async () => {
    setIsGenerating(true)
    setError(null)

    try {
      const prepared = await interviewService.prepare({
        ...(tab === 'paste' ? { jobContent: text } : { document: document! }),
        mode: modeId,
      })

      setPreparedSession(prepared)
      router.push({ pathname: '/questions-ready', params: { sessionId: prepared.session.id } })
    } catch (err: any) {
      setError(err?.message || `Could not set up your ${copy.sessionNoun}. Please try again.`)
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={[styles.avatar, { backgroundColor: colors.brandSoft }]}>
          <ThemedText style={[styles.avatarInitial, { color: colors.tint }]}>
            {(user?.full_name || user?.email || '?').charAt(0).toUpperCase()}
          </ThemedText>
        </View>
        <ThemedText style={[styles.brand, { color: colors.tint }]}>VoxPrep</ThemedText>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <ThemedText style={[styles.title, { color: colors.oppositeColor }]}>{copy.setupTitle}</ThemedText>
        <ThemedText style={[styles.sub, { color: colors.subtext }]}>{copy.setupSubtitle}</ThemedText>

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
                onChangeText={(v) => setText(v.slice(0, MAX_CHARS))}
                placeholder={source.placeholder}
                placeholderTextColor={colors.muted}
                style={[styles.textarea, { color: colors.oppositeColor }]}
                textAlignVertical="top"
                editable={!isGenerating}
              />
              <View style={styles.textareaFooter}>
                <ThemedText style={{ color: hasEnoughText ? colors.muted : colors.tint, fontSize: 12 }}>
                  {hasEnoughText
                    ? `${source.label} looks good`
                    : `At least ${source.minLength} characters`}
                </ThemedText>
                <View style={[styles.counterPill, { backgroundColor: colors.card }]}>
                  <ThemedText style={{ color: colors.oppositeColor, fontWeight: '600', fontSize: 12 }}>
                    {text.length} / <ThemedText style={{ color: colors.muted }}>{MAX_CHARS}</ThemedText>
                  </ThemedText>
                </View>
              </View>
            </View>
          ) : (
            <Pressable
              style={[styles.uploadBox, { borderColor: document ? colors.tint : colors.border }]}
              onPress={pickDocument}
              disabled={isGenerating}
            >
              <Ionicons name={document ? 'document-text' : 'cloud-upload-outline'} size={36} color={colors.tint} />
              {document ? (
                <>
                  <ThemedText style={{ color: colors.oppositeColor, fontWeight: '600', marginTop: 6 }} numberOfLines={1}>
                    {document.name}
                  </ThemedText>
                  <ThemedText style={{ color: colors.muted, fontSize: 13 }}>
                    {formatSize(document.size)} · Tap to replace
                  </ThemedText>
                </>
              ) : (
                <>
                  <ThemedText style={{ color: colors.oppositeColor, fontWeight: '600', marginTop: 6 }}>Upload PDF, DOCX or TXT</ThemedText>
                  <ThemedText style={{ color: colors.muted, fontSize: 13 }}>Tap to choose a file from your device</ThemedText>
                </>
              )}
            </Pressable>
          )}

          <View style={styles.infoRow}>
            <Ionicons name="information-circle" size={16} color={colors.tint} />
            <ThemedText style={{ color: colors.subtext, fontSize: 12, flex: 1 }}>{copy.setupInfoNote}</ThemedText>
          </View>

          {error ? (
            <View style={[styles.errorBox, { backgroundColor: colors.brandSoft }]}>
              <Ionicons name="alert-circle" size={16} color="#EF4444" />
              <ThemedText style={{ color: colors.oppositeColor, fontSize: 13, flex: 1 }}>{error}</ThemedText>
            </View>
          ) : null}

          <Pressable
            style={[styles.cta, { backgroundColor: canGenerate ? colors.tint : colors.border }]}
            onPress={generate}
            disabled={!canGenerate}
          >
            {/* The questions themselves are written live during the session,
                so this button prepares the interview rather than generating a
                list — the copy has to promise the thing that actually happens. */}
            {isGenerating ? (
              <>
                <ActivityIndicator color="#fff" size="small" />
                <ThemedText style={styles.ctaText}>Setting up...</ThemedText>
              </>
            ) : (
              <>
                <ThemedText style={styles.ctaText}>Set Up My {copy.sessionNoun}</ThemedText>
                <Ionicons name="sparkles" size={16} color="#fff" />
              </>
            )}
          </Pressable>

          {isGenerating ? (
            <ThemedText style={{ color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 10 }}>
              Reading your {source.label.toLowerCase()} — this takes a few seconds.
            </ThemedText>
          ) : null}
        </View>

        <LinearGradient
          colors={[colors.tint, '#7A4CF0']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.promo}
        >
          <ThemedText style={styles.promoTitle}>{copy.setupPromoTitle}</ThemedText>
          <ThemedText style={styles.promoBody}>{copy.setupPromoBody}</ThemedText>
          <Ionicons name="settings" size={88} color="#ffffff20" style={styles.promoIcon} />
        </LinearGradient>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1 },
  avatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontWeight: '700', fontSize: 15, lineHeight: 20 },
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

  uploadBox: { borderWidth: 2, borderStyle: 'dashed', borderRadius: 12, padding: 40, alignItems: 'center', gap: 6, minHeight: 240, justifyContent: 'center' },

  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, marginBottom: 16 },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, marginBottom: 14 },

  cta: { borderRadius: 999, height: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  ctaText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  promo: { borderRadius: 12, padding: 20, overflow: 'hidden', position: 'relative' },
  promoTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  promoBody: { color: '#ffffffcc', marginBottom: 14, fontSize: 13 },
  promoIcon: { position: 'absolute', right: -10, bottom: -10 },
})
