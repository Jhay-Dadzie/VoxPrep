import React, { useEffect, useState } from 'react'
import { StyleSheet, View, ScrollView, Image, Pressable, TextInput, ActivityIndicator } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ThemedText } from '@/components/themed-text'
import { ModeBadge } from '@/components/mode-badge'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { useMode } from '@/hooks/mode-context'
import { useSession } from '@/hooks/session-context'
import { generateQuestions, extractDocumentText, ApiError } from '@/services/api'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system/legacy'
import { Colors } from '@/constants/theme'

const AVATAR = 'https://i.pravatar.cc/100?img=12'
const MAX_LENGTH = 5000

/**
 * Session setup — the screen where the source material is supplied.
 *
 * Every user-facing string here comes from the active mode, so this is a job
 * description in Job Interview mode, a syllabus in Oral Exam mode, and a
 * proposal in Viva mode. Only Job Interview takes a second document (the CV),
 * which is why the secondary card is conditional rather than always present.
 */
export default function Practice() {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const { modeId, mode, copy } = useMode()
  const [tab, setTab] = useState<'paste' | 'upload'>('paste')
  const [text, setText] = useState('')
  const [secondaryText, setSecondaryText] = useState('')
  const [secondaryOpen, setSecondaryOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadedName, setUploadedName] = useState<string | null>(null)
  const { start } = useSession()

  // Switching mode invalidates whatever was pasted — a syllabus is not a job
  // description. The tab screen stays mounted, so clear it explicitly.
  useEffect(() => {
    setText('')
    setSecondaryText('')
    setSecondaryOpen(false)
    setTab('paste')
    setError(null)
    setUploadedName(null)
  }, [modeId])

  const secondary = mode.secondarySource

  /**
   * Pick a document, extract its text on the server, and drop the result into
   * the paste box.
   *
   * It switches back to the Paste tab deliberately: the user should see what
   * was actually extracted and be able to fix it before generating. A silent
   * upload that produced garbled text would be much harder to debug.
   */
  const handleUpload = async () => {
    if (busy) return
    setError(null)

    const picked = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'],
      copyToCacheDirectory: true,
    })

    if (picked.canceled) return
    const file = picked.assets?.[0]
    if (!file) return

    setBusy(true)
    try {
      const base64 = await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.Base64,
      })

      const result = await extractDocumentText({
        filename: file.name,
        mimeType: file.mimeType,
        base64,
      })

      setText(result.text)
      setUploadedName(result.filename)
      setTab('paste')
      if (result.truncated) {
        setError('That document was long, so only the first 20,000 characters were kept.')
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not read that file.')
    } finally {
      setBusy(false)
    }
  }

  const handleGenerate = async () => {
    if (busy) return
    setError(null)
    setBusy(true)
    try {
      const result = await generateQuestions({
        mode: modeId,
        source: text,
        secondarySource: secondaryText || null,
        count: 10,
      })
      start({
        sessionId: result.sessionId,
        modeId,
        questions: result.questions,
        source: text,
        secondarySource: secondaryText || null,
      })

      // Straight to the interview. CV gap analysis happens afterwards, from the
      // results screen — showing it first would tell the candidate exactly what
      // to work into their answers.
      router.push('/countdown')
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Something went wrong. Please try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  const tooShort = text.trim().length < mode.source.minLength

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Image source={{ uri: AVATAR }} style={styles.avatar} />
        <ThemedText style={[styles.brand, { color: colors.tint }]}>VoxPrep</ThemedText>
        <View style={{ flex: 1 }} />
        <ModeBadge />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        <ThemedText style={[styles.title, { color: colors.oppositeColor }]}>
          {copy.setupTitle}
        </ThemedText>
        <ThemedText style={[styles.sub, { color: colors.subtext }]}>
          {copy.setupSubtitle}
        </ThemedText>

        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <ThemedText style={[styles.sourceLabel, { color: colors.oppositeColor }]}>
            {mode.source.label}
          </ThemedText>

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
                onChangeText={(v) => setText(v.slice(0, MAX_LENGTH))}
                placeholder={mode.source.placeholder}
                placeholderTextColor={colors.muted}
                style={[styles.textarea, { color: colors.oppositeColor }]}
                textAlignVertical="top"
              />
              <View style={styles.textareaFooter}>
                {uploadedName ? (
                  <View style={styles.fileChip}>
                    <Ionicons name="document-text" size={13} color={colors.tint} />
                    <ThemedText style={{ color: colors.tint, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
                      {uploadedName}
                    </ThemedText>
                  </View>
                ) : (
                  <ThemedText style={{ color: colors.muted, fontSize: 12 }}>
                    Minimum {mode.source.minLength} characters recommended
                  </ThemedText>
                )}
                <View style={[styles.counterPill, { backgroundColor: colors.card }]}>
                  <ThemedText style={{ color: colors.oppositeColor, fontWeight: '600', fontSize: 12 }}>
                    {text.length} / <ThemedText style={{ color: colors.muted }}>{MAX_LENGTH}</ThemedText>
                  </ThemedText>
                </View>
              </View>
            </View>
          ) : (
            <Pressable
              style={[styles.uploadBox, { borderColor: colors.border }, busy && { opacity: 0.6 }]}
              onPress={handleUpload}
              disabled={busy}
              accessibilityRole="button"
              accessibilityState={{ disabled: busy, busy }}
            >
              {busy ? (
                <>
                  <ActivityIndicator color={colors.tint} />
                  <ThemedText style={{ color: colors.oppositeColor, fontWeight: '600', marginTop: 6 }}>
                    Reading your file…
                  </ThemedText>
                </>
              ) : (
                <>
                  <Ionicons name="cloud-upload-outline" size={36} color={colors.tint} />
                  <ThemedText style={{ color: colors.oppositeColor, fontWeight: '600', marginTop: 6 }}>Upload PDF or DOCX</ThemedText>
                  <ThemedText style={{ color: colors.muted, fontSize: 13 }}>Tap to choose a file from your device</ThemedText>
                </>
              )}
            </Pressable>
          )}

          <View style={styles.infoRow}>
            <Ionicons name="information-circle" size={16} color={colors.tint} />
            <ThemedText style={{ color: colors.subtext, fontSize: 12, flex: 1 }}>
              {copy.setupInfoNote}
            </ThemedText>
          </View>

          {error && (
            <View style={[styles.errorBox, { backgroundColor: colors.dangerBg }]}>
              <Ionicons name="alert-circle" size={16} color={colors.danger} />
              <ThemedText style={{ color: colors.danger, fontSize: 12, flex: 1, lineHeight: 17 }}>
                {error}
              </ThemedText>
            </View>
          )}

          <Pressable
            style={[
              styles.cta,
              { backgroundColor: colors.tint },
              (busy || tooShort) && { opacity: 0.5 },
            ]}
            onPress={handleGenerate}
            disabled={busy || tooShort}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy || tooShort, busy }}
          >
            {busy ? (
              <>
                <ActivityIndicator color="#fff" size="small" />
                <ThemedText style={styles.ctaText}>Generating…</ThemedText>
              </>
            ) : (
              <>
                <ThemedText style={styles.ctaText}>Generate Questions</ThemedText>
                <Ionicons name="sparkles" size={16} color="#fff" />
              </>
            )}
          </Pressable>
        </View>

        {secondary && (
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <Pressable
              style={styles.secondaryHead}
              onPress={() => setSecondaryOpen((open) => !open)}
              accessibilityRole="button"
              accessibilityState={{ expanded: secondaryOpen }}
            >
              <View style={{ flex: 1 }}>
                <View style={styles.secondaryTitleRow}>
                  <ThemedText style={[styles.sourceLabel, { color: colors.oppositeColor, marginBottom: 0 }]}>
                    {secondary.label}
                  </ThemedText>
                  {secondary.optional && (
                    <View style={[styles.optionalPill, { backgroundColor: colors.brandSoft }]}>
                      <ThemedText style={[styles.optionalText, { color: colors.tint }]}>Optional</ThemedText>
                    </View>
                  )}
                </View>
                {!secondaryOpen && (
                  <ThemedText style={{ color: colors.subtext, fontSize: 12, marginTop: 6 }}>
                    {secondary.placeholder}
                  </ThemedText>
                )}
              </View>
              <Ionicons
                name={secondaryOpen ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={colors.subtext}
              />
            </Pressable>

            {secondaryOpen && (
              <View style={[styles.textareaWrap, styles.secondaryTextareaWrap, { backgroundColor: colors.inputBg }]}>
                <TextInput
                  multiline
                  value={secondaryText}
                  onChangeText={(v) => setSecondaryText(v.slice(0, MAX_LENGTH))}
                  placeholder={secondary.placeholder}
                  placeholderTextColor={colors.muted}
                  style={[styles.textarea, styles.secondaryTextarea, { color: colors.oppositeColor }]}
                  textAlignVertical="top"
                />
                <View style={styles.textareaFooter}>
                  <View style={{ flex: 1 }} />
                  <View style={[styles.counterPill, { backgroundColor: colors.card }]}>
                    <ThemedText style={{ color: colors.oppositeColor, fontWeight: '600', fontSize: 12 }}>
                      {secondaryText.length} / <ThemedText style={{ color: colors.muted }}>{MAX_LENGTH}</ThemedText>
                    </ThemedText>
                  </View>
                </View>
              </View>
            )}
          </View>
        )}

        <LinearGradient
          colors={[colors.tint, '#7A4CF0']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.promo}
        >
          <ThemedText style={styles.promoTitle}>{copy.setupPromoTitle}</ThemedText>
          <ThemedText style={styles.promoBody}>{copy.setupPromoBody}</ThemedText>
          <Pressable style={[styles.quickStart, { backgroundColor: colors.card }]} onPress={() => router.push('/countdown')}>
            <ThemedText style={{ color: colors.tint, fontWeight: '700' }}>Quick Start</ThemedText>
          </Pressable>
          <Ionicons name={mode.icon as any} size={88} color="#ffffff20" style={styles.promoIcon} />
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
  sourceLabel: { fontSize: 15, fontWeight: '700', marginBottom: 12 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, marginBottom: 18 },
  tab: { flex: 1, paddingVertical: 12, flexDirection: 'row', justifyContent: 'center', gap: 6, borderBottomWidth: 2 },

  textareaWrap: { borderRadius: 12, padding: 14, minHeight: 240 },
  textarea: { flex: 1, minHeight: 190, fontSize: 14, lineHeight: 20 },
  textareaFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  counterPill: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  fileChip: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1, marginRight: 8 },

  secondaryHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  secondaryTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  optionalPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  optionalText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  secondaryTextareaWrap: { minHeight: 160, marginTop: 14 },
  secondaryTextarea: { minHeight: 110 },

  uploadBox: { borderWidth: 2, borderStyle: 'dashed', borderRadius: 12, padding: 56, alignItems: 'center', gap: 6, minHeight: 240, justifyContent: 'center' },

  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, marginBottom: 16 },
  errorBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 10, padding: 12, marginBottom: 12 },

  cta: { borderRadius: 999, height: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  ctaText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  promo: { borderRadius: 12, padding: 20, overflow: 'hidden', position: 'relative' },
  promoTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  promoBody: { color: '#ffffffcc', marginBottom: 14, fontSize: 13 },
  quickStart: { alignSelf: 'flex-start', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999 },
  promoIcon: { position: 'absolute', right: -10, bottom: -10 },
})
