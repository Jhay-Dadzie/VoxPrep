/**
 * Extract key skills from job description text
 */
export const extractSkills = (text) => {
  if (!text) return [];
  
  const commonSkills = [
    'javascript', 'react', 'node', 'python', 'java', 'sql', 'aws', 'docker', 
    'kubernetes', 'leadership', 'communication', 'teamwork', 'agile', 'scrum'
  ];
  
  const skills = [];
  const lowerText = text.toLowerCase();
  
  commonSkills.forEach(skill => {
    if (lowerText.includes(skill)) {
      skills.push(skill);
    }
  });
  
  const skillRegex = /\b(?:experience with|proficiency in|knowledge of|skills:?\s*)?([a-zA-Z]+(?:\s+[a-zA-Z]+)*)\b/g;
  let match;
  while ((match = skillRegex.exec(text)) !== null) {
    const skill = match[1].toLowerCase().trim();
    if (skill.length > 2 && !skills.includes(skill)) {
      skills.push(skill);
    }
  }
  
  return [...new Set(skills)].slice(0, 15);
};

/**
 * Simple experience level detection
 */
export const detectExperienceLevel = (text) => {
  const lower = text.toLowerCase();
  if (lower.includes('senior') || lower.includes('lead') || lower.includes('5+') || lower.includes('7+')) return 'senior';
  if (lower.includes('mid') || lower.includes('3+') || lower.includes('4+')) return 'mid';
  if (lower.includes('junior') || lower.includes('1+') || lower.includes('entry')) return 'junior';
  return null;
};

/**
 * Industry detection (basic)
 */
export const detectIndustry = (text) => {
  const lower = text.toLowerCase();
  if (lower.includes('tech') || lower.includes('software') || lower.includes('it')) return 'Technology';
  if (lower.includes('finance') || lower.includes('bank')) return 'Finance';
  if (lower.includes('health') || lower.includes('medical')) return 'Healthcare';
  if (lower.includes('educat')) return 'Education';
  return null;
};

/**
 * Derive a title from source material when the user did not supply one.
 *
 * Asking someone to name a job description they just pasted is friction for no
 * benefit — the name is almost always the first real line of the text. Parsed
 * documents open with noise (page numbers, "Job Description", bare URLs), so
 * those lines are skipped rather than used.
 */
const TITLE_NOISE = /^(job\s+(description|posting|advert(isement)?)|position|role|vacancy|about\s+(us|the\s+role)|page\s+\d+|\d+|https?:\/\/)/i;

export const deriveTitle = (text, fallback = 'Untitled role') => {
  if (!text) return fallback;

  const line = text
    .split('\n')
    .map((candidate) => candidate.replace(/\s+/g, ' ').trim())
    // Long lines are prose, not headings; short ones are usually furniture.
    .find((candidate) => candidate.length >= 3 && candidate.length <= 120 && !TITLE_NOISE.test(candidate));

  if (!line) return fallback;

  // Titles are stored in a VARCHAR(255); trim well inside it.
  return line.length > 120 ? `${line.slice(0, 117)}...` : line;
};

/**
 * Placeholder written into user_responses.transcribed_text before transcription
 * runs, so the audio metadata is never lost if transcription then fails.
 *
 * It has to live somewhere both the writer (the speech controller) and the
 * readers (the interview loop, the grader) can see, because to them a row still
 * carrying this text is an unanswered question — not an answer that says this.
 * The column is NOT NULL, which is why a placeholder exists at all.
 */
export const PENDING_TRANSCRIPT = '[Transcription in progress…]';

/** True when a stored response holds a real answer rather than a placeholder. */
export const hasRealAnswer = (text) => {
  const trimmed = typeof text === 'string' ? text.trim() : '';
  return trimmed.length > 0 && trimmed !== PENDING_TRANSCRIPT;
};

export default {
  extractSkills,
  detectExperienceLevel,
  detectIndustry,
  deriveTitle,
  PENDING_TRANSCRIPT,
  hasRealAnswer,
};
