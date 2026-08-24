import { useCallback, useEffect, useRef, useState } from 'react'
import { interviewService } from '@/services/interview'
import { VoiceAgentConnection, type AgentEvent, type AgentPanelMember } from '@/services/voice-agent'
import type { ModeId } from '@/constants/modes'

/**
 * Drives one interview held as a live voice call.
 *
 * Almost all of the machinery this replaces is gone. There is no turn loop, no
 * endpointer deciding when an answer has finished, no silence timer, no
 * per-question synthesis and no upload: the agent hears the candidate stop and
 * replies, and the server writes both halves down as they happen. What is left
 * here is a socket's lifecycle and the state the screen renders.
 *
 * The one thing this hook still owns is the ending. Grading is a separate,
 * slower model call over the finished transcript — kept out of the conversation
 * deliberately, so the interviewer never waits on the grader.
 */

export type AgentPhase =
  | 'connecting'
  /** The interviewer is talking. */
  | 'speaking'
  /** The microphone is live and the candidate has the floor. */
  | 'listening'
  /** The interviewer is delivering its closing remarks. */
  | 'closing'
  /** Assessing the finished interview. */
  | 'grading'
  | 'done'
  | 'error'

const BAR_COUNT = 28

export type TranscriptLine = {
  role: 'assistant' | 'user'
  content: string
  /** Which panelist said it. Absent on a one-on-one and on the candidate's turns. */
  speaker?: string
}

/** How many lines of the conversation to keep on screen. */
const VISIBLE_LINES = 8

type Options = {
  sessionId: string
  mode?: ModeId
  voice?: string
  /** The panel, chair first. Each seat speaks in its own voice. */
  panel?: AgentPanelMember[]
  /** How many people the candidate is facing. Derived from `panel` when absent. */
  panelSize?: number
  maxQuestions?: number
  onFinished: () => void
}

export function useAgentSession({
  sessionId,
  mode,
  voice,
  panel,
  panelSize,
  maxQuestions,
  onFinished,
}: Options) {
  const [phase, setPhase] = useState<AgentPhase>('connecting')
  const [error, setError] = useState<string | null>(null)
  const [transcript, setTranscript] = useState<TranscriptLine[]>([])
  const [askedCount, setAskedCount] = useState(0)
  const [questionCap, setQuestionCap] = useState(maxQuestions ?? 15)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [levels, setLevels] = useState<number[]>(Array(BAR_COUNT).fill(0))
  const [agentSpeaking, setAgentSpeaking] = useState(false)
  /** Which seat holds the floor. The server decides; this only follows along. */
  const [speakerIndex, setSpeakerIndex] = useState(0)

  /**
   * The current speaker's name, read inside the event handler.
   *
   * A ref rather than the state above because transcript lines are tagged at
   * the moment they arrive: reading state there would close over whoever was
   * speaking when the handler was created, which on a panel is the wrong person
   * from the second handover onwards.
   */
  const speakerName = useRef<string | undefined>(undefined)

  const connection = useRef<VoiceAgentConnection | null>(null)
  const mounted = useRef(true)
  const started = useRef(false)
  /** Set once the interview is over, so a late socket close cannot re-grade. */
  const finished = useRef(false)

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

  /**
   * Grade the finished interview and move on.
   *
   * Awaited rather than fired off: landing on an ungraded results screen looks
   * broken. A failure here still lets the candidate through — the answers are
   * already stored and the session can be graded again later.
   */
  const gradeAndLeave = useCallback(async () => {
    if (finished.current) return
    finished.current = true

    if (mounted.current) setPhase('grading')

    try {
      await interviewService.generateFeedback(sessionId)
    } catch {
      /* the results screen shows whatever exists */
    }

    if (!mounted.current) return
    setPhase('done')
    onFinished()
  }, [onFinished, sessionId])

  const onEvent = useCallback(
    (event: AgentEvent) => {
      if (!mounted.current) return

      switch (event.type) {
        case 'ready':
          setQuestionCap(event.maxQuestions)
          setPhase('speaking')
          break

        case 'speaker':
          setSpeakerIndex(event.index)
          speakerName.current = event.name
          break

        case 'transcript': {
          // Consecutive lines from the same speaker are one turn: the agent
          // emits a message per utterance, so an unmerged list reads as the
          // interviewer interrupting itself.
          const who = event.role === 'assistant' ? speakerName.current : undefined
          setTranscript((prev) => {
            const last = prev[prev.length - 1]
            const merged =
              // The floor only changes between turns, so two assistant lines
              // from different panelists are two turns, not one to merge.
              last?.role === event.role && last?.speaker === who
                ? [...prev.slice(0, -1), { role: event.role, content: `${last.content} ${event.content}`, speaker: who }]
                : [...prev, { role: event.role, content: event.content, speaker: who }]
            return merged.slice(-VISIBLE_LINES)
          })
          break
        }

        case 'user_speaking':
          setPhase('listening')
          break

        case 'agent_done':
          setPhase((current) => (current === 'closing' ? current : 'listening'))
          break

        case 'progress':
          setAskedCount(event.asked)
          setQuestionCap(event.maxQuestions)
          break

        case 'closing':
          setPhase('closing')
          break

        case 'done':
          gradeAndLeave()
          break

        case 'error':
          setError(event.message)
          setPhase('error')
          break
      }
    },
    [gradeAndLeave]
  )

  // ── Connect ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (started.current || !sessionId) return
    started.current = true

    const agent = new VoiceAgentConnection({
      sessionId,
      mode,
      voice,
      panel,
      panelSize,
      maxQuestions,
      onEvent,
      onLevel: (level) => {
        if (mounted.current) setLevels((prev) => [...prev.slice(1), level])
      },
      onAgentAudio: (speaking) => {
        if (!mounted.current) return
        setAgentSpeaking(speaking)
        // The interviewer's voice is the only reliable signal that it has the
        // floor; the server's events describe sending, not playing.
        if (speaking) setPhase((current) => (current === 'closing' ? current : 'speaking'))
      },
    })

    connection.current = agent

    // Marks started_at. Not awaited — nothing downstream needs it, and the
    // conversation should not wait on a bookkeeping write.
    interviewService.start(sessionId).catch(() => {})

    agent.start().catch((err: any) => {
      if (!mounted.current) return
      // A startup failure can happen after the socket has opened (for
      // example, while initializing the native audio graph). Close the
      // partially-started connection so it cannot later emit a second,
      // misleading disconnect error over the real startup error.
      agent.stop()
      setError(err?.message || 'Could not start the interview.')
      setPhase('error')
    })

    return () => {
      agent.stop()
      connection.current = null
    }
    // `panel` is deliberately not a dependency. It is a fresh array on every
    // render, and a changed dependency runs the cleanup — which would hang up a
    // live interview. The roster is fixed for the session anyway: it is read
    // once, when the socket opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, mode, voice, panelSize, maxQuestions, onEvent])

  // ── Controls ───────────────────────────────────────────────────────────────

  /** Ask the interviewer to wrap up. The answers so far are already stored. */
  const endEarly = useCallback(() => {
    if (finished.current) return
    setPhase('closing')
    connection.current?.end()
  }, [])

  /**
   * Leave without waiting for a sign-off.
   *
   * The escape hatch for a broken connection: everything answered so far is
   * already saved server-side, so this still produces a graded session.
   */
  const abandon = useCallback(() => {
    connection.current?.stop()
    gradeAndLeave()
  }, [gradeAndLeave])

  return {
    phase,
    error,
    /** The conversation so far, newest last, capped for display. */
    transcript,
    /** What the interviewer said most recently — the current question. */
    currentQuestion:
      [...transcript].reverse().find((line) => line.role === 'assistant')?.content ?? null,
    /** What the candidate is saying or has just said. */
    liveAnswer: transcript[transcript.length - 1]?.role === 'user'
      ? transcript[transcript.length - 1].content
      : null,
    /** Which seat is asking. Always 0 on a one-on-one. */
    speakerIndex,
    askedCount,
    maxQuestions: questionCap,
    elapsedSeconds,
    levels,
    isAgentSpeaking: agentSpeaking,
    isListening: phase === 'listening' && !agentSpeaking,
    endEarly,
    abandon,
  }
}
