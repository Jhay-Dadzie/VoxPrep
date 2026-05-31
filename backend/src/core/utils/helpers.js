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

export default {
  extractSkills,
  detectExperienceLevel,
  detectIndustry,
};
