import Joi from 'joi';

/**
 * Generic validation helper following the project's controller pattern.
 */
export const validateInput = (data, schema, options = { stripUnknown: true }) => {
  const { error, value } = schema.validate(data, {
    abortEarly: false,
    ...options
  });

  if (!error) return { valid: true, value };

  return {
    valid: false,
    errors: error.details.map((d) => d.message),
  };
};

const jobDataSchema = Joi.object({
  title: Joi.string().min(2).max(100).required(),
  company_name: Joi.string().allow('', null).optional(),
  job_content: Joi.string().min(50).required().messages({
    'string.min': 'Job content is too short to generate meaningful questions (min 50 chars)',
  }),
  key_skills: Joi.array().items(Joi.string().trim().min(1)).optional(),
  required_experience_level: Joi.string()
    .valid('entry', 'junior', 'mid', 'senior', 'lead')
    .optional(),
  industry: Joi.string().max(100).optional().allow('', null),
}).required();

/**
 * Schema for POST /questions/generate
 */
export const generateQuestionsSchema = Joi.object({
  sessionId: Joi.string().guid({ version: 'uuidv4' }).required().messages({
    'string.guid': 'sessionId must be a valid UUID',
    'any.required': 'sessionId is required',
  }),
  questionCount: Joi.number().integer().min(1).max(20).default(10),
  jobData: jobDataSchema.optional(),
});
