import Joi from 'joi';

const jobDescriptionSchema = Joi.object({
  title: Joi.string().trim().min(3).max(255).required()
    .messages({
      'string.empty': 'Job title is required',
      'string.min': 'Job title must be at least 3 characters',
    }),
  company_name: Joi.string().trim().max(255).allow(null, ''),
  job_content: Joi.string().trim().min(50).allow(null, '')
    .messages({
      'string.min': 'Job content must be at least 50 characters',
    }),
  required_experience_level: Joi.string().valid('junior', 'mid', 'senior', 'lead').allow(null, ''),
  industry: Joi.string().trim().max(100).allow(null, ''),
});

const createJobDescriptionValidation = Joi.object({
  title: jobDescriptionSchema.extract('title'),
  company_name: jobDescriptionSchema.extract('company_name'),
  job_content: jobDescriptionSchema.extract('job_content'),
  required_experience_level: jobDescriptionSchema.extract('required_experience_level'),
  industry: jobDescriptionSchema.extract('industry'),
});

const updateJobDescriptionValidation = Joi.object({
  title: jobDescriptionSchema.extract('title').optional(),
  company_name: jobDescriptionSchema.extract('company_name').optional(),
  job_content: jobDescriptionSchema.extract('job_content').optional(),
  required_experience_level: jobDescriptionSchema.extract('required_experience_level').optional(),
  industry: jobDescriptionSchema.extract('industry').optional(),
});

export { createJobDescriptionValidation, updateJobDescriptionValidation };

export default {
  createJobDescriptionValidation,
  updateJobDescriptionValidation,
};
