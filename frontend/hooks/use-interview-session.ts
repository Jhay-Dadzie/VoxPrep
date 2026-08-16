import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
} from 'expo-audio'
import { interviewService } from '@/services/interview'
import { speechService } from '@/services/speech'
import type { InterviewQuestion } from '@/types/interview'
import type { ModeId } from '@/constants/modes'

/**
 * Drives one semi-structured interview from the opening question to the result.
 *
 * The interview is a conversation, not a playlist. Nothing is known in advance:
 * each turn the server is asked what to ask next, given everything the
 * candidate has said so far, and it answers with a question or with "that's
 * enough". So the loop is five steps, not four — fetch, speak, record,
 * transcribe, repeat — and it ends when the interviewer decides it does or when
 * the question cap is reached.
 *
 * The screen renders `phase` and calls `submitAnswer`; everything else is
 * sequenced here.
 *
 * Failure policy: nothing in the audio path is allowed to strand the user. If
 * the question cannot be spoken it is shown as text and recording starts
 * anyway; if transcription fails the answer is kept as pending rather than
 * discarded, and the user can retype it. If the interviewer itself fails to
 * respond, the session can be retried or ended with what has been answered.
 */

export type SessionPhase =
  | 'preparing'
  /** Waiting on the interviewer to compose the next question. */
  | 'thinking'
  | 'asking'
  | 'answering'
  | 'submitting'
  | 'finishing'
  | 'grading'
  | 'done'
  | 'error'

/**
 * The stock preset: AAC in an .m4a container on both platforms. Deepgram takes
 * it directly, and it is roughly a tenth the size of the uncompressed WAV a
 * phone would otherwise upload over mobile data for a two-minute answer.
 */
const RECORDER_OPTIONS = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true }

const BAR_COUNT = 12
const SILENT_BAR = 6

/**
 * Longest a question is allowed to sit in the "being spoken" phase. Comfortably
 * above the ~20s a synthesised question takes, low enough that a stall does not
 * read as a freeze.
 */
const MAX_QUESTION_AUDIO_MS = 60_000

/** expo-audio meters in dBFS: about -60 is silence, 0 is peak. */
const meteringToHeight = (db?: number) => {
  const clamped = Math.max(-60, Math.min(0, db ?? -60))
  return SILENT_BAR + ((clamped + 60) / 60) * 36
}

type Options = {
  sessionId: string
  /** Practice mode; shapes the interviewer's persona server-side. */
  mode?: ModeId
  /** Panelist voice id from the interviewer roster; the server maps it to a TTS voice. */
  voice?: string
  /** Ceiling on questions. The server clamps this to its own maximum of 15. */
  maxQuestions?: number
  onFinished: () => void
}

export function useInterviewSession({ sessionId, mode, voice, maxQuestions, onFinished }: Options) {
  const [question, setQuestion] = useState<InterviewQuestion | null>(null)
  const [askedCount, setAskedCount] = useState(0)
  const [questionCap, setQuestionCap] = useState(maxQuestions ?? 15)
  const [phase, setPhase] = useState<SessionPhase>('preparing')
  const [error, setError] = useState<string | null>(null)
  const [transcript, setTranscript] = useState<string | null>(null)
  const [closingRemark, setClosingRemark] = useState<string | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [bars, setBars] = useState<number[]>(Array(BAR_COUNT).fill(SILENT_BAR))
  const [micAvailable, setMicAvailable] = useState(true)
  /** Set when audio was stored but no transcript came back, so the UI can offer a typed answer. */
  const [needsTypedAnswer, setNeedsTypedAnswer] = useState(false)
  /** True once the current question's audio is loaded in the player. */
  const [audioReady, setAudioReady] = useState(false)
  /** True while a replay is being fetched, so the button can show it is working. */
  const [isReplaying, setIsReplaying] = useState(false)

  const onMeter = useRef((status: any) => {
    if (typeof status?.metering === 'number') {
      setBars((prev) => [...prev.slice(1), meteringToHeight(status.metering)])
    }
  }).current

  const recorder = useAudioRecorder(RECORDER_OPTIONS, onMeter)
  const player = useAudioPlayer(null)
  const playerStatus = useAudioPlayerStatus(player)

  // Guards against React 18 double-invoking the bootstrap effect, and against a
  // late async callback acting on a screen the user has already left.
  const bootstrapped = useRef(false)
  const mounted = useRef(true)
  const answerStartedAt = useRef<number | null>(null)
  /** True once playback of the current question has actually been observed. */
  const startedPlaying = useRef(false)
  const beginningAnswer = useRef(false)
  /** Set once the interview is ending, so a late turn cannot restart it. */
  const finishing = useRef(false)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // ── Elapsed timer ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase === 'done' || phase === 'error') return
    const timer = setInterval(() => setElapsedSeconds((s) => s + 1), 1000)
    return () => clearInterval(timer)
  }, [phase])

  // ── Recording ──────────────────────────────────────────────────────────────

  const beginAnswer = useCallback(async () => {
    // Two paths can call this — playback finishing and the stall timeout — and
    // preparing the recorder twice would throw.
    if (beginningAnswer.current) return
    beginningAnswer.current = true

    answerStartedAt.current = Date.now()

    try {
      await recorder.prepareToRecordAsync()
      recorder.record()
      if (mounted.current) setMicAvailable(true)
    } catch {
      // No microphone, or permission was revoked mid-session. The question
      // still stands; the user can type an answer instead of being stuck.
      if (mounted.current) {
        setMicAvailable(false)
        setNeedsTypedAnswer(true)
      }
    }

    if (mounted.current) setPhase('answering')
  }, [recorder])

  // ── Asking ─────────────────────────────────────────────────────────────────

  /**
   * Fetch the spoken form of a question and hand it to the player.
   *
   * Returns whether audio is actually available, because "the question was
   * asked" and "the question can be heard" are different facts and the replay
   * control depends on the second one.
   */
  const loadQuestionAudio = useCallback(
    async (target: InterviewQuestion) => {
      const uri = await speechService.synthesizeToFile(target.questionText, {
        voice,
        cacheKey: target.id,
      })
      if (!mounted.current) return false

      player.replace(uri)
      setAudioReady(true)
      return true
    },
    [player, voice]
  )

  const askQuestion = useCallback(
    async (target: InterviewQuestion) => {
      if (!mounted.current) return

      setPhase('asking')
      setNeedsTypedAnswer(false)
      setAudioReady(false)
      setBars(Array(BAR_COUNT).fill(SILENT_BAR))

      startedPlaying.current = false
      beginningAnswer.current = false

      try {
        await loadQuestionAudio(target)
        if (!mounted.current) return

        player.play()
        // Playback completion moves us on — see the didJustFinish effect below.
      } catch {
        // TTS is an enhancement, not a gate: the question text is already on
        // screen, so go straight to recording rather than blocking the session.
        await beginAnswer()
      }
    },
    [beginAnswer, loadQuestionAudio, player]
  )

  /**
   * Move to recording once the question has finished being spoken.
   *
   * `didJustFinish` stays set on the status snapshot after playback ends, so it
   * is still true when the next question starts. Requiring that playback was
   * actually observed for *this* question first stops that stale flag from
   * cutting the next one off the moment it begins.
   */
  useEffect(() => {
    if (phase !== 'asking') return

    if (playerStatus.playing) {
      startedPlaying.current = true
      return
    }

    if (startedPlaying.current && playerStatus.didJustFinish) {
      beginAnswer()
    }
  }, [phase, playerStatus.playing, playerStatus.didJustFinish, beginAnswer])

  /**
   * Safety net: if the audio never reports playing or finishing — a silent
   * decode failure, a route change mid-playback — the session would sit in
   * 'asking' forever. The question is already on screen, so fall through to
   * recording rather than stranding the user.
   */
  useEffect(() => {
    if (phase !== 'asking') return

    const timeout = setTimeout(() => beginAnswer(), MAX_QUESTION_AUDIO_MS)
    return () => clearTimeout(timeout)
  }, [phase, question?.id, beginAnswer])

  // ── Ending ─────────────────────────────────────────────────────────────────

  const finish = useCallback(async () => {
    if (finishing.current) return
    finishing.current = true

    setPhase('finishing')

    try {
      await recorder.stop()
    } catch {
      /* nothing was recording */
    }

    try {
      await interviewService.complete(sessionId)
    } catch {
      // The answers are already saved; a failed status flip must not read to
      // the user as a lost session. History reconciles it.
    }

    // Grading is what the user is actually waiting for, so it is awaited rather
    // than fired off - landing on an ungraded results screen looks broken. A
    // failure here still lets them through; the session can be regraded.
    if (mounted.current) setPhase('grading')
    try {
      await interviewService.generateFeedback(sessionId)
    } catch {
      /* results screen shows what exists */
    }

    if (!mounted.current) return
    setPhase('done')
    onFinished()
  }, [onFinished, recorder, sessionId])

  // ── The turn loop ──────────────────────────────────────────────────────────

  /**
   * Ask the interviewer what comes next, and either speak it or end the
   * interview.
   *
   * This is the only place a question comes from. There is no local queue to
   * fall out of step with the server, which is what makes a retry after a
   * dropped response safe: the server hands back the outstanding question
   * rather than composing another.
   */
  const advance = useCallback(async () => {
    if (finishing.current) return

    setPhase('thinking')
    setError(null)

    try {
      const turn = await interviewService.nextTurn(sessionId, { mode, maxQuestions })
      if (!mounted.current) return

      setQuestionCap(turn.maxQuestions)

      if (turn.done || !turn.question) {
        setClosingRemark(turn.closingRemark)
        await finish()
        return
      }

      setQuestion(turn.question)
      setAskedCount(turn.askedCount)
      await askQuestion(turn.question)
    } catch (err: any) {
      if (!mounted.current) return
      // Everything answered so far is already stored, so this is recoverable:
      // the screen offers a retry, and ending early still grades the rest.
      setError(err?.message || 'The interviewer could not continue. Try again, or end the interview.')
      setPhase('error')
    }
  }, [askQuestion, finish, maxQuestions, mode, sessionId])

  // ── Bootstrap ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (bootstrapped.current || !sessionId) return
    bootstrapped.current = true

    ;(async () => {
      try {
        const permission = await AudioModule.requestRecordingPermissionsAsync()
        if (!permission.granted && mounted.current) {
          setMicAvailable(false)
          setNeedsTypedAnswer(true)
        }

        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })
        await interviewService.start(sessionId)
      } catch {
        // A session that is already in progress (a resumed one) rejects start;
        // that is not a reason to refuse to run it.
      }

      if (mounted.current) await advance()
    })()
  }, [advance, sessionId])

  // ── Answering ──────────────────────────────────────────────────────────────

  /**
   * Stop recording, transcribe, and take the next turn.
   *
   * The transcribe call carries the session and question ids, so the server
   * persists the audio and the answer itself — there is no separate submit.
   */
  const submitAnswer = useCallback(async () => {
    if (!question || phase !== 'answering') return

    setPhase('submitting')
    setError(null)

    const durationSeconds = answerStartedAt.current
      ? (Date.now() - answerStartedAt.current) / 1000
      : undefined

    let uri: string | null = null
    try {
      await recorder.stop()
      uri = recorder.uri
    } catch {
      uri = null
    }

    if (!uri) {
      // Nothing was captured. Ask for a typed answer rather than silently
      // recording a blank for this question.
      if (mounted.current) {
        setNeedsTypedAnswer(true)
        setPhase('answering')
      }
      return
    }

    try {
      const result = await speechService.transcribeRecording(uri, {
        sessionId,
        questionId: question.id,
        durationSeconds,
      })
      if (!mounted.current) return

      if (result.pending) {
        // Audio is stored server-side but unusable as an answer; let the user
        // supply the text instead of advancing over a placeholder.
        setNeedsTypedAnswer(true)
        setError('We saved your recording but could not transcribe it. Type your answer to continue.')
        setPhase('answering')
        return
      }

      setTranscript(result.transcript)
      await advance()
    } catch (err: any) {
      if (!mounted.current) return
      setError(err?.message || 'Could not submit that answer.')
      setNeedsTypedAnswer(true)
      setPhase('answering')
    }
  }, [advance, phase, question, recorder, sessionId])

  /** Fallback path: the user types the answer when audio or STT failed. */
  const submitTypedAnswer = useCallback(
    async (text: string) => {
      if (!question || !text.trim()) return

      setPhase('submitting')
      setError(null)

      const durationSeconds = answerStartedAt.current
        ? (Date.now() - answerStartedAt.current) / 1000
        : undefined

      try {
        await interviewService.submitAnswer(sessionId, question.id, {
          text: text.trim(),
          durationSeconds,
        })
        if (!mounted.current) return
        setTranscript(text.trim())
        await advance()
      } catch (err: any) {
        if (!mounted.current) return
        setError(err?.message || 'Could not save that answer.')
        setPhase('answering')
      }
    },
    [advance, question, sessionId]
  )

  /**
   * Play the current question again.
   *
   * The old version bailed out silently when the player held nothing, which is
   * exactly the case the user hits: if synthesis failed when the question was
   * asked, there is no audio to seek, so every tap did nothing at all with no
   * explanation. Now a missing clip is fetched on demand — replay is the second
   * chance for a question that could not be spoken the first time.
   */
  const replayQuestion = useCallback(async () => {
    if (!question || isReplaying) return

    setIsReplaying(true)
    try {
      if (!audioReady || !player.isLoaded) {
        await loadQuestionAudio(question)
        if (!mounted.current) return
        player.play()
        return
      }

      // seekTo resolves once the player has actually moved; playing before it
      // does can resume from where the clip already ended.
      await player.seekTo(0)
      if (!mounted.current) return
      player.play()
    } catch (err: any) {
      if (mounted.current) {
        setError(err?.message || 'Could not play that question again. The text is on screen.')
      }
    } finally {
      if (mounted.current) setIsReplaying(false)
    }
  }, [audioReady, isReplaying, loadQuestionAudio, player, question])

  /** Retry a turn the interviewer failed to produce. The answers so far are untouched. */
  const retry = useCallback(async () => {
    if (phase !== 'error') return
    await advance()
  }, [advance, phase])

  /** Leave early — the answers given so far are already saved and still graded. */
  const endEarly = useCallback(async () => {
    await finish()
  }, [finish])

  // Stop the mic if the screen goes away mid-answer.
  useEffect(
    () => () => {
      recorder.stop().catch(() => {})
    },
    [recorder]
  )

  return {
    question,
    /** 1-based position of the current question. */
    askedCount,
    /** Most questions this interview can run to; it may close sooner. */
    maxQuestions: questionCap,
    phase,
    error,
    transcript,
    closingRemark,
    elapsedSeconds,
    bars,
    micAvailable,
    needsTypedAnswer,
    isSpeaking: phase === 'asking' && playerStatus.playing,
    isReplaying,
    /** Replay is offered whenever there is a question on screen to replay. */
    canReplay: Boolean(question) && (phase === 'asking' || phase === 'answering'),
    submitAnswer,
    submitTypedAnswer,
    replayQuestion,
    retry,
    endEarly,
    dismissError: () => setError(null),
  }
}
