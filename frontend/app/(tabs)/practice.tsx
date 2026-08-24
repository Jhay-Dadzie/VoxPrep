import React, { useCallback, useEffect, useState } from 'react'
import { StyleSheet, View, ScrollView, Pressable, TextInput, ActivityIndicator, Image } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import * as DocumentPicker from 'expo-document-picker'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ThemedText } from '@/components/themed-text'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { useMode } from '@/hooks/mode-context'
import { useInterviewer } from '@/hooks/interviewer-context'
import { useAuth } from '@/hooks/auth-context'
import { Colors } from '@/constants/theme'
import { MODES, MODE_LIST, clampPanelSize, type ModeId } from '@/constants/modes'
import { ACCEPTED_DOCUMENT_LABEL, ACCEPTED_DOCUMENT_TYPES } from '@/constants/uploads'
import {
  PANEL_SIZES,
  avatarSource,
  describeComposition,
  panelSizeLabel,
  shortName,
  type Gender,
  type Panelist,
  type PanelSize,
} from '@/constants/interviewers'
import { interviewService } from '@/services/interview'
import { examService } from '@/services/exam'
import { forgetActiveExam, readActiveExam } from '@/lib/active-exam'
import { setPreparedSession } from '@/lib/prepared-session'
import type { PickedDocument } from '@/types/interview'

const MAX_CHARS = 5000

const formatSize = (bytes?: number) => {
  if (!bytes) return ''
  const kb = bytes / 1024
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`
}

/**
 * Session setup — the one screen where a practice session is configured.
 *
 * What used to be two full-screen steps in the login flow (what are you
 * preparing for, and who should question you) are the filters at the top of
 * this screen. Signing in no longer interrogates the user before showing them
 * the app, and changing any of it is a tap here rather than a logout.
 *
 * The three filters are not independent of each other: the mode decides how
 * many people may sit opposite you, which is why a visa interview collapses the
 * panel filter to a single officer.
 */
export default function Practice() {
  const colorScheme = useColorScheme()
  const colors = Colors[colorScheme ?? 'light']
  const { modeId, mode, copy, setMode } = useMode()
  const { panelSize, gender, interviewer, setPanelSize, setGender } = useInterviewer()
  const { user } = useAuth()

  const [tab, setTab] = useState<'paste' | 'upload'>('paste')
  const [text, setText] = useState('')
  const [document, setDocument] = useState<PickedDocument | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** An exam left part-way through, if there is one. */
  const [resumable, setResumable] = useState<{ sessionId: string; answered: number; total: number } | null>(
    null
  )

  const source = mode.source
  const allowedSizes = mode.panel.sizes
  // A written paper has nobody asking the questions, so both interviewer filters
  // are switched off rather than narrowed — and the roster below them, which
  // would otherwise show people who are not going to be there, is hidden.
  const picksInterviewer = mode.interviewerChoice.enabled
  const isExam = mode.format === 'written'
  // An exam is set strictly from the material, and typing it out by hand is
  // both the slowest way to supply a syllabus and the one that loses the most
  // of it — the tables, the diagrams' captions, the chapter headings a paper
  // needs to spread its questions across. So a written paper takes a file and
  // only a file, and the tab bar is not shown for a choice that has one option.
  const uploadOnly = isExam
  const activeTab = uploadOnly ? 'upload' : tab
  const hasEnoughText = text.trim().length >= source.minLength
  const canGenerate = !isGenerating && (activeTab === 'paste' ? hasEnoughText : !!document)

  // The panel filter is constrained by the mode, and both are restored from
  // storage independently — so a stored pair can arrive out of step (a panel of
  // four alongside a visa interview). Correct it wherever it comes from, rather
  // than only in the mode handler.
  //
  // Skipped for modes that do not use an interviewer at all: an exam should not
  // quietly rewrite the panel the user picked for their interviews.
  useEffect(() => {
    if (!picksInterviewer) return
    const clamped = clampPanelSize(modeId, panelSize)
    if (clamped !== panelSize) setPanelSize(clamped)
  }, [modeId, panelSize, picksInterviewer, setPanelSize])

  /**
   * Offer the way back into an unfinished paper.
   *
   * History only lists sessions that have been completed or paused, so an exam
   * abandoned at question 19 has no other route back. The stored id is checked
   * against the server rather than trusted: a paper since submitted, deleted or
   * belonging to a signed-out account is forgotten instead of being offered.
   */
  useFocusEffect(
    useCallback(() => {
      let cancelled = false

      ;(async () => {
        const stored = await readActiveExam()
        if (cancelled || !stored) {
          if (!cancelled) setResumable(null)
          return
        }

        try {
          const exam = await examService.get(stored)
          if (cancelled) return

          if (exam.submitted) {
            await forgetActiveExam(stored)
            setResumable(null)
            return
          }

          setResumable({
            sessionId: stored,
            answered: exam.questions.filter((question) => question.selectedOption).length,
            total: exam.questions.length,
          })
        } catch {
          await forgetActiveExam(stored)
          if (!cancelled) setResumable(null)
        }
      })()

      return () => {
        cancelled = true
      }
    }, [])
  )

  const pickDocument = async () => {
    setError(null)
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ACCEPTED_DOCUMENT_TYPES,
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

  const chooseMode = (id: ModeId) => {
    if (id === modeId) return
    setMode(id)
    // Clamped here as well as in the effect above so the panel chips never show
    // a selection the new mode does not allow, even for one frame.
    if (MODES[id].interviewerChoice.enabled) {
      const clamped = clampPanelSize(id, panelSize)
      if (clamped !== panelSize) setPanelSize(clamped)
    }
    // The pasted material belongs to the old mode's question set — a syllabus
    // is not a job description — so it does not carry over.
    setText('')
    setDocument(null)
    setError(null)
  }

  /**
   * Set up whatever the chosen mode is, and open it.
   *
   * The two branches diverge at the API and at the destination, not before: an
   * exam is written in full here and opens straight into question one, while an
   * interview creates an empty session and goes via the ready sheet and the
   * countdown, because its questions do not exist until the interviewer asks
   * them.
   */
  const generate = async () => {
    setIsGenerating(true)
    setError(null)

    const material = activeTab === 'paste' ? { jobContent: text } : { document: document! }

    try {
      if (isExam) {
        const exam = await examService.prepare({ ...material, mode: modeId })
        router.push({ pathname: '/exam-session', params: { sessionId: exam.session.id } })
        return
      }

      const prepared = await interviewService.prepare({ ...material, mode: modeId })

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
        <ThemedText style={[styles.title, { color: colors.oppositeColor }]}>
          Set up your {copy.sessionNoun}
        </ThemedText>
        <ThemedText style={[styles.sub, { color: colors.subtext }]}>
          Choose what you are preparing for and who should question you, then add the material your
          questions are generated from.
        </ThemedText>

        {/* An exam left part-way through. Nothing else in the app can reach it. */}
        {resumable ? (
          <Pressable
            style={[styles.resumeCard, { backgroundColor: colors.card, borderColor: colors.tint }]}
            onPress={() =>
              router.push({ pathname: '/exam-session', params: { sessionId: resumable.sessionId } })
            }
          >
            <View style={[styles.resumeIcon, { backgroundColor: colors.brandSoft }]}>
              <Ionicons name="play" size={16} color={colors.tint} />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={[styles.resumeTitle, { color: colors.oppositeColor }]}>
                Finish your exam
              </ThemedText>
              <ThemedText style={{ color: colors.subtext, fontSize: 12, marginTop: 2 }}>
                {resumable.answered} of {resumable.total} answered · nothing marked yet
              </ThemedText>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        ) : null}

        {/* ── Filters ──────────────────────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.cardHeader}>
            <Ionicons name="options-outline" size={18} color={colors.tint} />
            <ThemedText style={[styles.cardHeaderText, { color: colors.oppositeColor }]}>
              Session Filters
            </ThemedText>
          </View>

          <FilterGroup
            title="What are you preparing for?"
            hint="Sets the questions you are asked, how they are graded, and the wording across the app."
            colors={colors}
          >
            <View style={styles.chipWrap}>
              {MODE_LIST.map((option) => (
                <Chip
                  key={option.id}
                  label={option.label}
                  icon={option.icon}
                  selected={option.id === modeId}
                  onPress={() => chooseMode(option.id)}
                  colors={colors}
                />
              ))}
            </View>
          </FilterGroup>

          <FilterGroup
            title="How many interviewers?"
            hint={
              !picksInterviewer
                ? mode.interviewerChoice.note!
                : mode.panel.note ??
                  'A bigger panel takes turns and presses from more angles, so it is the harder practice.'
            }
            colors={colors}
          >
            <View style={styles.chipWrap}>
              {PANEL_SIZES.map((size) => {
                const isAllowed = picksInterviewer && allowedSizes.includes(size)
                return (
                  <Chip
                    key={size}
                    label={panelSizeLabel(size)}
                    icon={size === 1 ? 'person-outline' : size === 4 ? 'people-circle-outline' : 'people-outline'}
                    selected={isAllowed && size === panelSize}
                    disabled={!isAllowed}
                    onPress={() => setPanelSize(size as PanelSize)}
                    colors={colors}
                  />
                )
              })}
            </View>
          </FilterGroup>

          <FilterGroup
            title={
              !picksInterviewer
                ? 'Male or female interviewer?'
                : panelSize === 1
                  ? 'Male or female interviewer?'
                  : 'Who chairs the panel?'
            }
            hint={
              !picksInterviewer
                ? 'Not used for a written paper — nothing is read aloud.'
                : panelSize === 1
                  ? 'The voice that conducts the whole session.'
                  : 'The chair opens the session, holds it together, and speaks the most.'
            }
            colors={colors}
          >
            <View style={styles.chipWrap}>
              {(['male', 'female'] as Gender[]).map((option) => (
                <Chip
                  key={option}
                  label={option === 'male' ? 'Male' : 'Female'}
                  icon={option === 'male' ? 'man-outline' : 'woman-outline'}
                  selected={picksInterviewer && option === gender}
                  disabled={!picksInterviewer}
                  onPress={() => setGender(option)}
                  colors={colors}
                />
              ))}
            </View>
          </FilterGroup>

          {/* Who the filters above actually resolved to. Nobody, for an exam. */}
          {picksInterviewer ? (
            <View style={[styles.roster, { borderTopColor: colors.border }]}>
              <ThemedText style={[styles.rosterLabel, { color: colors.muted }]}>
                {interviewer.isPanel
                  ? `${panelSizeLabel(panelSize).toUpperCase()} · ${describeComposition(interviewer.members).toUpperCase()}`
                  : 'YOUR INTERVIEWER'}
              </ThemedText>
              <View style={styles.rosterRow}>
                {interviewer.members.map((member) => (
                  <MemberChip key={member.voiceId} member={member} colors={colors} />
                ))}
              </View>
            </View>
          ) : (
            <View style={[styles.roster, { borderTopColor: colors.border }]}>
              <ThemedText style={[styles.rosterLabel, { color: colors.muted }]}>
                YOUR PAPER
              </ThemedText>
              <View style={styles.paperRow}>
                <Ionicons name="list-outline" size={18} color={colors.tint} />
                <ThemedText style={{ color: colors.subtext, fontSize: 13, flex: 1, lineHeight: 19 }}>
                  {mode.paper?.questionCount ?? 30} multiple-choice questions, {mode.paper?.optionCount ?? 4}{' '}
                  options each. One question at a time, and nothing is marked until you complete the exam.
                </ThemedText>
              </View>
            </View>
          )}
        </View>

        {/* ── Source material ──────────────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.cardHeader}>
            <Ionicons name="reader-outline" size={18} color={colors.tint} />
            <ThemedText style={[styles.cardHeaderText, { color: colors.oppositeColor }]}>
              {copy.setupTitle}
            </ThemedText>
          </View>
          <ThemedText style={[styles.groupHint, { color: colors.subtext, marginBottom: 14 }]}>
            {copy.setupSubtitle}
          </ThemedText>

          {uploadOnly ? null : (
            <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
              <Pressable
                style={[styles.tab, { borderBottomColor: activeTab === 'paste' ? colors.tint : 'transparent' }]}
                onPress={() => setTab('paste')}
              >
                <Ionicons name="clipboard-outline" size={16} color={activeTab === 'paste' ? colors.tint : colors.subtext} />
                <ThemedText style={{ color: activeTab === 'paste' ? colors.tint : colors.subtext, fontWeight: '600' }}>Paste Text</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.tab, { borderBottomColor: activeTab === 'upload' ? colors.tint : 'transparent' }]}
                onPress={() => setTab('upload')}
              >
                <Ionicons name="cloud-upload-outline" size={16} color={activeTab === 'upload' ? colors.tint : colors.subtext} />
                <ThemedText style={{ color: activeTab === 'upload' ? colors.tint : colors.subtext, fontWeight: '600' }}>Upload File</ThemedText>
              </Pressable>
            </View>
          )}

          {activeTab === 'paste' ? (
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
                  <ThemedText style={{ color: colors.oppositeColor, fontWeight: '600', marginTop: 6 }}>
                    {uploadOnly ? 'Upload your material' : 'Upload a document'}
                  </ThemedText>
                  <ThemedText style={{ color: colors.muted, fontSize: 13 }}>Tap to choose a file from your device</ThemedText>
                  <ThemedText style={{ color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 4 }}>
                    {ACCEPTED_DOCUMENT_LABEL}
                  </ThemedText>
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
                <ThemedText style={styles.ctaText}>
                  {isExam ? 'Setting your paper...' : 'Setting up...'}
                </ThemedText>
              </>
            ) : (
              <>
                <ThemedText style={styles.ctaText}>
                  {isExam ? 'Set My Exam' : `Set Up My ${copy.sessionNoun}`}
                </ThemedText>
                <Ionicons name="sparkles" size={16} color="#fff" />
              </>
            )}
          </Pressable>

          {/* An exam really does generate its questions here, so the wait is a
              minute rather than a moment — say so, or it reads as a hang. */}
          {isGenerating ? (
            <ThemedText style={{ color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 10 }}>
              {isExam
                ? mode.examCopy!.generatingNote
                : `Reading your ${source.label.toLowerCase()} — this takes a few seconds.`}
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

/** One labelled filter: a title, the reason it matters, and its controls. */
function FilterGroup({
  title,
  hint,
  colors,
  children,
}: {
  title: string
  hint: string
  colors: typeof Colors.light
  children: React.ReactNode
}) {
  return (
    <View style={styles.group}>
      <ThemedText style={[styles.groupTitle, { color: colors.oppositeColor }]}>{title}</ThemedText>
      <ThemedText style={[styles.groupHint, { color: colors.subtext }]}>{hint}</ThemedText>
      {children}
    </View>
  )
}

function Chip({
  label,
  icon,
  selected,
  disabled,
  onPress,
  colors,
}: {
  label: string
  icon: string
  selected: boolean
  disabled?: boolean
  onPress: () => void
  colors: typeof Colors.light
}) {
  const fg = disabled ? colors.muted : selected ? '#fff' : colors.oppositeColor

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: !!disabled }}
      accessibilityLabel={label}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.tint : colors.inputBg,
          borderColor: selected ? colors.tint : colors.border,
          opacity: disabled ? 0.45 : 1,
        },
      ]}
    >
      <Ionicons name={icon as any} size={15} color={selected ? '#fff' : disabled ? colors.muted : colors.tint} />
      <ThemedText style={[styles.chipText, { color: fg }]}>{label}</ThemedText>
    </Pressable>
  )
}

function MemberChip({ member, colors }: { member: Panelist; colors: typeof Colors.light }) {
  return (
    <View style={styles.member}>
      <Image source={avatarSource(member)} style={styles.memberAvatar} />
      <ThemedText style={[styles.memberName, { color: colors.oppositeColor }]} numberOfLines={1}>
        {shortName(member)}
      </ThemedText>
      <ThemedText style={[styles.memberRole, { color: colors.muted }]} numberOfLines={1}>
        {member.role}
      </ThemedText>
    </View>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1 },
  avatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontWeight: '700', fontSize: 15, lineHeight: 20 },
  brand: { fontWeight: '700', fontSize: 17 },

  title: { fontSize: 28, fontWeight: '800', marginTop: 10, lineHeight: 34 },
  sub: { fontSize: 14, marginTop: 12, marginBottom: 22, lineHeight: 20 },

  resumeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 20,
  },
  resumeIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  resumeTitle: { fontWeight: '700', fontSize: 14 },

  card: { borderRadius: 12, padding: 18, marginBottom: 20 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  cardHeaderText: { fontSize: 16, fontWeight: '700' },

  group: { marginBottom: 18 },
  groupTitle: { fontSize: 14, fontWeight: '700' },
  groupHint: { fontSize: 12, marginTop: 3, lineHeight: 17 },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: { fontSize: 13, fontWeight: '600' },

  roster: { borderTopWidth: 1, paddingTop: 14 },
  rosterLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },
  rosterRow: { flexDirection: 'row', gap: 14, marginTop: 12 },
  paperRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 12 },
  member: { alignItems: 'center', width: 62 },
  memberAvatar: { width: 40, height: 40, borderRadius: 20, marginBottom: 5 },
  memberName: { fontSize: 11, fontWeight: '700' },
  memberRole: { fontSize: 10, marginTop: 1 },

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
