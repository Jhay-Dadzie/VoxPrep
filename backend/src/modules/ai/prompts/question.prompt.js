export const buildQuestionPrompt = (jobData, { questionCount = 10 } = {}) => {
  const skills = Array.isArray(jobData.key_skills) && jobData.key_skills.length
    ? jobData.key_skills.join(", ")
    : "N/A";

  return [
    {
      role: "system",
      content:
        "You are an expert interview coach who generates realistic, high-signal interview questions.",
    },
    {
      role: "user",
      content: `
Generate ${questionCount} interview questions based on the job data below.

Title: ${jobData.title}
Company: ${jobData.company_name || "N/A"}
Industry: ${jobData.industry || "N/A"}
Experience level: ${jobData.required_experience_level || "mid"}
Key skills: ${skills}

Job description:
${jobData.job_content}

Requirements:
- Mix behavioral, technical, situational, and general questions where appropriate
- Match the difficulty to the experience level
- Make the questions specific to the role and job description
- Return ONLY valid JSON

Return this exact shape:
{
  "questions": [
    {
      "question_text": "string",
      "question_type": "behavioral|technical|situational|general",
      "difficulty_level": "easy|medium|hard",
      "ideal_answer_guidelines": "string"
    }
  ]
}
`.trim(),
    },
  ];
};
