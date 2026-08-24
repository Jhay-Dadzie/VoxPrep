/**
 * Who is on the panel, and what each of them sounds like.
 *
 * The client picks a roster (frontend/constants/interviewers.ts) and sends it up
 * as names, seats and voice ids. This file turns that into something the agent
 * can be configured with: a seat per panelist, each with a TTS model that is
 * *different from every other seat's*.
 *
 * ── Why distinctness is enforced here and not trusted ───────────────────────
 *
 * A panel whose members share a voice is a panel of one wearing several names,
 * which is exactly the bug this exists to prevent. Two things cause it. A stale
 * client can send a voice id the catalogue no longer has, and `resolveVoice`
 * answers unknown ids with the default — send two and both seats become the
 * default voice. And a hand-rolled client can simply send the same id twice.
 * So collisions are resolved against the catalogue rather than reported: a
 * colleague in an unexpected voice is a far smaller failure than a colleague
 * who is audibly the chair.
 *
 * The bench below is only reached when the client sends no roster at all — an
 * older build that predates panel voices sends a single `voice` and a size. It
 * mirrors the client roster so those sessions still get real names.
 */

import { TTS_VOICES } from '../speech/tts.service.js';
import { resolveVoice } from './voices.js';

/** Filled in seat order when the client sends no roster. Chair first. */
const BENCH = [
  { voiceId: 'f_warm_01', name: 'Dr. Rose-Mary' },
  { voiceId: 'm_measured_01', name: 'Dr. Benjamin Partey' },
  { voiceId: 'm_direct_02', name: 'Marcus Bell' },
  { voiceId: 'f_precise_02', name: 'Priya Nair' },
  { voiceId: 'm_calm_03', name: 'David Okonkwo' },
  { voiceId: 'f_bright_04', name: 'Nadia Haddad' },
  { voiceId: 'm_even_06', name: 'Ryan Cole' },
  { voiceId: 'm_formal_04', name: 'Tom Whitfield' },
  { voiceId: 'm_brisk_05', name: 'Hassan Ali' },
  { voiceId: 'f_measured_03', name: 'Elena Rossi' },
];

/** Seat labels, in the order seats are filled. Index 0 always chairs. */
const SEAT_ROLES = ['Chair', 'Technical', 'Domain Expert', 'External'];

const NAME_BY_VOICE_ID = new Map(BENCH.map((seat) => [seat.voiceId, seat.name]));

const clean = (value) => (typeof value === 'string' ? value.trim() : '');

/** Catalogue keys in a stable order, for filling collisions from. */
const CATALOGUE_KEYS = Object.keys(TTS_VOICES);

/**
 * A TTS key not yet spoken by anyone on this panel.
 *
 * Prefers a voice of the same apparent gender as the one that collided, so a
 * substitution does not silently re-cast a panelist.
 */
const unusedVoiceKey = (taken, preferred) => {
  const gender = TTS_VOICES[preferred]?.gender;

  return (
    CATALOGUE_KEYS.find((key) => !taken.has(key) && TTS_VOICES[key].gender === gender) ||
    CATALOGUE_KEYS.find((key) => !taken.has(key)) ||
    preferred
  );
};

/**
 * Seat a panel.
 *
 * @param {Array<{voiceId?: string, name?: string, role?: string}>} [requested]
 *   the roster as the client sent it
 * @param {object} [options]
 * @param {number} [options.size=1] - seats to fill, already clamped by the mode
 * @param {string} [options.voice] - chair's voice, for clients that send only one
 * @returns {Array<{voiceId: string, name: string, role: string, ttsVoice: string, model: string}>}
 *   one entry per seat, chair first, every `model` distinct
 */
export const resolvePanel = (requested, { size = 1, voice } = {}) => {
  const seats = Math.max(1, Math.round(Number(size)) || 1);

  const sent = (Array.isArray(requested) ? requested : [])
    .filter((member) => member && typeof member === 'object')
    .slice(0, seats)
    .map((member) => ({
      voiceId: clean(member.voiceId),
      name: clean(member.name),
      role: clean(member.role),
    }));

  // An older client sends one voice and a number. Its chair is still whoever it
  // asked for; the rest of the room is ours to cast.
  if (sent.length === 0 && clean(voice)) sent.push({ voiceId: clean(voice), name: '', role: '' });

  const usedVoiceIds = new Set(sent.map((member) => member.voiceId).filter(Boolean));
  for (const bench of BENCH) {
    if (sent.length >= seats) break;
    if (usedVoiceIds.has(bench.voiceId)) continue;

    usedVoiceIds.add(bench.voiceId);
    sent.push({ voiceId: bench.voiceId, name: bench.name, role: '' });
  }

  const takenVoices = new Set();

  return sent.slice(0, seats).map((member, index) => {
    const preferred = resolveVoice(member.voiceId);
    const ttsVoice = takenVoices.has(preferred) ? unusedVoiceKey(takenVoices, preferred) : preferred;
    takenVoices.add(ttsVoice);

    return {
      voiceId: member.voiceId || ttsVoice,
      name: member.name || NAME_BY_VOICE_ID.get(member.voiceId) || `Interviewer ${index + 1}`,
      role: member.role || SEAT_ROLES[index] || 'Panellist',
      ttsVoice,
      model: TTS_VOICES[ttsVoice].deepgram,
    };
  });
};

/**
 * Who holds the floor on a given agent turn.
 *
 * Round-robin, but in blocks rather than one turn each. A panel that changed
 * voice on every question could never ask a follow-up — the candidate would
 * hear a new person pick up a thread they were not part of. Two turns is enough
 * for a question and the follow-up it invites, and still gets everyone on a
 * four-person panel heard inside the first eight questions.
 */
export const TURNS_PER_SPEAKER = 2;

export const speakerIndexForTurn = (turn, panelSize) => {
  if (!panelSize || panelSize <= 1) return 0;
  return Math.floor(Math.max(0, turn) / TURNS_PER_SPEAKER) % panelSize;
};

export default { resolvePanel, speakerIndexForTurn, TURNS_PER_SPEAKER };
