import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import * as DocumentPicker from 'expo-document-picker'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ThemedText } from '@/components/themed-text'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { Colors } from '@/constants/theme'
import { cvService } from '@/services/cv'
import { downloadTailoredCv, shareTailoredCv, type CvDownloadResult } from '@/lib/cv-pdf'
import type { TailoredCv } from '@/types/cv'
import type { PickedDocument } from '@/types/interview'

/**
 * The step between the end of an interview and the results screen: offer to
 * rewrite the candidate's CV against the job description they were just
 * interviewed on.
 *
 * Entirely optional, and it says so. The interview is over, the answers are
 * graded, and results are one tap away at every step — including while the
 * model is working and after a failure. Nothing here is allowed to stand
 * between the candidate and the feedback they actually came for.
 */

type Colours = typeof Colors.light

type Step =
  /** "Do you want this?" — the only step the candidate has not opted into. */
  | 'ask'
  | 'upload'
  | 'working'
  | 'ready'

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

export default function CvTailor() {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const { sessionId } = useLocalSearchParams<{ sessionId?: string }>()

  const [step, setStep] = useState<Step>('ask')
  const [document, setDocument] = useState<PickedDocument | null>(null)
  const [result, setResult] = useState<TailoredCv | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<'download' | 'share' | null>(null)
  /** What happened last time, so the button can confirm it rather than just reset. */
  const [saved, setSaved] = useState<CvDownloadResult | null>(null)

  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const goToResults = useCallback(() => {
    router.replace({
      pathname: '/(tabs)/results',
      ...(sessionId ? { params: { sessionId } } : {}),
    })
  }, [sessionId])

  /**
   * A CV already tailored for this session, fetched quietly in the background.
   *
   * Costs one small GET and saves the candidate from paying for the same model
   * call twice if they came back to this screen — on the first run through it
   * simply resolves to null before they have finished reading the question.
   */
  useEffect(() => {
    if (!sessionId) return

    cvService
      .getForSession(sessionId)
      .then((existing) => {
        if (mounted.current && existing) setResult(existing)
      })
      .catch(() => {
        /* nothing to restore; the normal upload flow still works */
      })
  }, [sessionId])

  const tailor = useCallback(
    async (picked: PickedDocument) => {
      if (!sessionId) return

      setStep('working')
      setError(null)

      try {
        const tailored = await cvService.tailor(sessionId, picked)
        if (!mounted.current) return
        setResult(tailored)
        setStep('ready')
      } catch (err: any) {
        if (!mounted.current) return
        setError(err?.message || 'We could not tailor your CV. You can try again or skip.')
        setStep('upload')
      }
    },
    [sessionId]
  )

  /**
   * Pick and send in one action. The candidate has already said yes to this;
   * a second "now upload it" tap after choosing the file buys nothing.
   */
  const pickAndTailor = useCallback(async () => {
    setError(null)

    let picked: PickedDocument
    try {
      const picker = await DocumentPicker.getDocumentAsync({
        type: ACCEPTED_TYPES,
        copyToCacheDirectory: true,
      })
      if (picker.canceled || !picker.assets?.length) return

      const asset = picker.assets[0]
      picked = {
        uri: asset.uri,
        name: asset.name,
        // Some Android providers return no mimeType; the server also sniffs by
        // extension, so a sensible default is enough to get the upload through.
        mimeType: asset.mimeType ?? 'application/octet-stream',
        size: asset.size ?? undefined,
      }
    } catch {
      setError('Could not open that file. Try a different one.')
      return
    }

    setDocument(picked)
    await tailor(picked)
  }, [tailor])

  /**
   * Save the CV, or send it somewhere — two separate intents, one code path.
   *
   * A cancelled folder picker is recorded as nothing having happened: the
   * candidate backed out on purpose, and telling them that failed would be
   * inventing a problem.
   */
  const exportCv = useCallback(
    async (action: 'download' | 'share') => {
      if (!result) return

      setBusyAction(action)
      setError(null)

      try {
        const outcome = await (action === 'download' ? downloadTailoredCv : shareTailoredCv)(
          result.document
        )
        if (mounted.current && outcome.outcome !== 'cancelled') setSaved(outcome)
      } catch (err: any) {
        if (mounted.current) setError(err?.message || 'Could not create the PDF. Please try again.')
      } finally {
        if (mounted.current) setBusyAction(null)
      }
    },
    [result]
  )

  // No session to tailor against: there is nothing to offer, so don't ask.
  useEffect(() => {
    if (!sessionId) goToResults()
  }, [sessionId, goToResults])

  if (!sessionId) return null

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <ThemedText style={[styles.brand, { color: colors.tint }]}>VoxPrep</ThemedText>
        <View style={{ flex: 1 }} />
        {/* Always available, at every step. */}
        <Pressable hitSlop={10} onPress={goToResults}>
          <ThemedText style={{ color: colors.subtext, fontWeight: '600' }}>
            {step === 'ready' ? 'Done' : 'Skip'}
          </ThemedText>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {step === 'ready' && result ? (
          <ReadyStep
            colors={colors}
            result={result}
            busyAction={busyAction}
            saved={saved}
            error={error}
            onDownload={() => exportCv('download')}
            onShare={() => exportCv('share')}
            onContinue={goToResults}
          />
        ) : (
          <OfferStep
            colors={colors}
            step={step}
            document={document}
            error={error}
            hasExisting={result != null}
            onYes={() => setStep(result ? 'ready' : 'upload')}
            onNo={goToResults}
            onPick={pickAndTailor}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

/** The question, the file picker, and the wait — one card, three faces. */
function OfferStep({
  colors,
  step,
  document,
  error,
  hasExisting,
  onYes,
  onNo,
  onPick,
}: {
  colors: Colours
  step: Step
  document: PickedDocument | null
  error: string | null
  hasExisting: boolean
  onYes: () => void
  onNo: () => void
  onPick: () => void
}) {
  const working = step === 'working'

  return (
    <>
      <LinearGradient
        colors={[colors.tint, '#7A4CF0']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <Ionicons name="document-text-outline" size={26} color="#fff" />
        <ThemedText style={styles.heroTitle}>Interview complete</ThemedText>
        <ThemedText style={styles.heroBody}>
          Want your CV tailored to this job before you see your results?
        </ThemedText>
      </LinearGradient>

      <View style={[styles.card, { backgroundColor: colors.card }]}>
        {step === 'ask' ? (
          <>
            <ThemedText style={[styles.cardTitle, { color: colors.oppositeColor }]}>
              Tailor my CV to this role
            </ThemedText>
            <ThemedText style={[styles.cardBody, { color: colors.subtext }]}>
              Upload your CV and we&apos;ll rewrite it against the job description you practised on —
              leading with the experience this employer asked for, in their words.
            </ThemedText>

            <View style={styles.promises}>
              <OfferPoint colors={colors} icon="shield-checkmark-outline" text="Nothing invented — only your own experience, rewritten and reordered" />
              <OfferPoint colors={colors} icon="download-outline" text="Download the result as a PDF" />
              <OfferPoint colors={colors} icon="time-outline" text="Takes about a minute" />
            </View>

            <Pressable style={[styles.cta, { backgroundColor: colors.tint }]} onPress={onYes}>
              <ThemedText style={styles.ctaText}>
                {hasExisting ? 'View my tailored CV' : 'Yes, tailor my CV'}
              </ThemedText>
              <Ionicons name="sparkles" size={16} color="#fff" />
            </Pressable>

            <Pressable style={styles.ghostCta} onPress={onNo}>
              <ThemedText style={{ color: colors.subtext, fontWeight: '600' }}>
                No thanks, show my results
              </ThemedText>
            </Pressable>
          </>
        ) : (
          <>
            <ThemedText style={[styles.cardTitle, { color: colors.oppositeColor }]}>
              {working ? 'Tailoring your CV' : 'Upload your CV'}
            </ThemedText>
            <ThemedText style={[styles.cardBody, { color: colors.subtext }]}>
              {working
                ? 'Reading your CV and rewriting it against the job description. This takes up to a minute.'
                : 'PDF, DOCX or TXT, up to 5 MB. A text-based file — a scan or photo has no text to read.'}
            </ThemedText>

            <Pressable
              style={[styles.uploadBox, { borderColor: document ? colors.tint : colors.border }]}
              onPress={onPick}
              disabled={working}
            >
              {working ? (
                <>
                  <ActivityIndicator color={colors.tint} size="large" />
                  <ThemedText style={{ color: colors.oppositeColor, fontWeight: '600', marginTop: 10 }}>
                    Working on it...
                  </ThemedText>
                </>
              ) : (
                <>
                  <Ionicons
                    name={document ? 'document-text' : 'cloud-upload-outline'}
                    size={36}
                    color={colors.tint}
                  />
                  {document ? (
                    <>
                      <ThemedText
                        style={{ color: colors.oppositeColor, fontWeight: '600', marginTop: 6 }}
                        numberOfLines={1}
                      >
                        {document.name}
                      </ThemedText>
                      <ThemedText style={{ color: colors.muted, fontSize: 13 }}>
                        {formatSize(document.size)} · Tap to choose another
                      </ThemedText>
                    </>
                  ) : (
                    <>
                      <ThemedText style={{ color: colors.oppositeColor, fontWeight: '600', marginTop: 6 }}>
                        Choose your CV
                      </ThemedText>
                      <ThemedText style={{ color: colors.muted, fontSize: 13 }}>
                        Tap to pick a file from your device
                      </ThemedText>
                    </>
                  )}
                </>
              )}
            </Pressable>

            {error ? <ErrorBox colors={colors} message={error} /> : null}

            <Pressable style={styles.ghostCta} onPress={onNo}>
              <ThemedText style={{ color: colors.subtext, fontWeight: '600' }}>
                {working ? 'Skip and show my results' : 'Skip — show my results'}
              </ThemedText>
            </Pressable>
          </>
        )}
      </View>
    </>
  )
}

/** The finished CV: what changed, what is still missing, and the download. */
function ReadyStep({
  colors,
  result,
  busyAction,
  saved,
  error,
  onDownload,
  onShare,
  onContinue,
}: {
  colors: Colours
  result: TailoredCv
  busyAction: 'download' | 'share' | null
  saved: CvDownloadResult | null
  error: string | null
  onDownload: () => void
  onShare: () => void
  onContinue: () => void
}) {
  const { document } = result

  // iOS has no user-visible Downloads folder — "Save to Files" is what the
  // system calls this, and calling it "Download" would promise a location the
  // platform does not have.
  const downloadLabel = Platform.OS === 'ios' ? 'Save to Files' : 'Download as PDF'

  return (
    <>
      <LinearGradient
        colors={[colors.tint, '#7A4CF0']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <Ionicons name="checkmark-circle-outline" size={26} color="#fff" />
        <ThemedText style={styles.heroTitle}>Your CV is tailored</ThemedText>
        <ThemedText style={styles.heroBody}>
          {document.headline
            ? `Rewritten for ${document.headline}. Read it through before you send it anywhere.`
            : 'Read it through before you send it anywhere.'}
        </ThemedText>
      </LinearGradient>

      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <ThemedText style={[styles.cardTitle, { color: colors.oppositeColor }]}>
          New professional summary
        </ThemedText>
        <ThemedText style={[styles.summary, { color: colors.subtext }]}>{document.summary}</ThemedText>

        {document.skills.length > 0 ? (
          <>
            <ThemedText style={[styles.sectionLabel, { color: colors.muted }]}>
              SKILLS, LED BY WHAT THIS JOB ASKED FOR
            </ThemedText>
            <View style={styles.chips}>
              {document.skills.slice(0, 12).map((skill) => (
                <View key={skill} style={[styles.chip, { backgroundColor: colors.brandSoft }]}>
                  <ThemedText style={{ color: colors.tint, fontSize: 12, fontWeight: '600' }}>
                    {skill}
                  </ThemedText>
                </View>
              ))}
            </View>
          </>
        ) : null}
      </View>

      {result.tailoringNotes.length > 0 ? (
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <ThemedText style={[styles.cardTitle, { color: colors.oppositeColor }]}>
            What changed
          </ThemedText>
          {result.tailoringNotes.map((note, index) => (
            <View key={index} style={styles.noteRow}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <ThemedText style={[styles.noteText, { color: colors.subtext }]}>{note}</ThemedText>
            </View>
          ))}
        </View>
      ) : null}

      {/* Shown as prominently as the changes. A tailored CV that quietly hides
          what the candidate cannot back up is the failure mode worth designing
          against — these are the questions they will be asked. */}
      {result.gaps.length > 0 ? (
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <ThemedText style={[styles.cardTitle, { color: colors.oppositeColor }]}>
            Still missing for this role
          </ThemedText>
          <ThemedText style={[styles.cardBody, { color: colors.subtext }]}>
            We didn&apos;t add these to your CV, because your CV doesn&apos;t evidence them yet.
          </ThemedText>
          {result.gaps.map((gap, index) => (
            <View key={index} style={styles.noteRow}>
              <Ionicons name="alert-circle" size={16} color={colors.warning} />
              <ThemedText style={[styles.noteText, { color: colors.subtext }]}>{gap}</ThemedText>
            </View>
          ))}
        </View>
      ) : null}

      {error ? <ErrorBox colors={colors} message={error} /> : null}

      {/* Where the file actually went. The whole point of writing it into a
          folder instead of firing a share sheet is that the answer is
          knowable — so it gets said. */}
      {saved && saved.outcome === 'saved' ? (
        <View style={[styles.savedBox, { backgroundColor: colors.successBg }]}>
          <Ionicons name="checkmark-circle" size={16} color={colors.success} />
          <ThemedText style={{ color: colors.oppositeColor, fontSize: 13, flex: 1 }}>
            Saved <ThemedText style={{ fontWeight: '700' }}>{saved.fileName}</ThemedText> to{' '}
            {saved.folder}.
          </ThemedText>
        </View>
      ) : null}

      <Pressable
        style={[styles.cta, { backgroundColor: colors.tint, marginBottom: 12 }]}
        onPress={onDownload}
        disabled={busyAction != null}
      >
        {busyAction === 'download' ? (
          <>
            <ActivityIndicator color="#fff" size="small" />
            <ThemedText style={styles.ctaText}>Preparing PDF...</ThemedText>
          </>
        ) : (
          <>
            <Ionicons name="download-outline" size={18} color="#fff" />
            {/* Only a real write to a folder earns "another copy" — a share
                that went to WhatsApp did not save anything to this device. */}
            <ThemedText style={styles.ctaText}>
              {saved?.outcome === 'saved' ? 'Save another copy' : downloadLabel}
            </ThemedText>
          </>
        )}
      </Pressable>

      <Pressable
        style={[styles.secondaryCta, { borderColor: colors.border, backgroundColor: colors.card, marginBottom: 12 }]}
        onPress={onShare}
        disabled={busyAction != null}
      >
        {busyAction === 'share' ? (
          <ActivityIndicator color={colors.oppositeColor} size="small" />
        ) : (
          <>
            <Ionicons name="share-outline" size={16} color={colors.oppositeColor} />
            <ThemedText style={{ color: colors.oppositeColor, fontWeight: '700', fontSize: 15 }}>
              Send it somewhere
            </ThemedText>
          </>
        )}
      </Pressable>

      <Pressable style={styles.ghostCta} onPress={onContinue}>
        <ThemedText style={{ color: colors.subtext, fontWeight: '600' }}>
          Continue to my results
        </ThemedText>
      </Pressable>
    </>
  )
}

/**
 * One line of the offer's "here is what this does" list.
 *
 * Not named Promise — that identifier is the global one Babel's async helpers
 * reach for from module scope, and shadowing it here would break every await in
 * this file in a way that only shows up at runtime.
 */
function OfferPoint({ colors, icon, text }: { colors: Colours; icon: any; text: string }) {
  return (
    <View style={styles.noteRow}>
      <Ionicons name={icon} size={16} color={colors.tint} />
      <ThemedText style={[styles.noteText, { color: colors.subtext }]}>{text}</ThemedText>
    </View>
  )
}

function ErrorBox({ colors, message }: { colors: Colours; message: string }) {
  return (
    <View style={[styles.errorBox, { backgroundColor: colors.dangerBg }]}>
      <Ionicons name="alert-circle" size={16} color={colors.danger} />
      <ThemedText style={{ color: colors.oppositeColor, fontSize: 13, flex: 1 }}>{message}</ThemedText>
    </View>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1 },
  brand: { fontWeight: '700', fontSize: 17 },

  hero: { borderRadius: 14, padding: 20, marginBottom: 16, gap: 6 },
  heroTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  heroBody: { color: '#ffffffcc', fontSize: 13, lineHeight: 19 },

  card: { borderRadius: 12, padding: 18, marginBottom: 16 },
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  cardBody: { fontSize: 13, lineHeight: 20, marginBottom: 14 },
  summary: { fontSize: 14, lineHeight: 22 },

  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginTop: 18, marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },

  promises: { gap: 10, marginBottom: 20 },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 10 },
  noteText: { fontSize: 13, lineHeight: 19, flex: 1 },

  uploadBox: {
    borderWidth: 2, borderStyle: 'dashed', borderRadius: 12, padding: 32,
    alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 200,
  },

  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, marginTop: 14, marginBottom: 4 },
  savedBox: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, marginBottom: 14 },

  cta: { borderRadius: 999, height: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 },
  ctaText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondaryCta: {
    borderRadius: 999, height: 54, borderWidth: 1,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  ghostCta: { height: 46, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
})
