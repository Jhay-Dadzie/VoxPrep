/**
 * Simplified Authentication Validation
 * Only: signup, login, forgot-password, reset-password
 */

import Joi from 'joi';

const object = Joi.object.bind(Joi);
const string = Joi.string.bind(Joi);

const PASSWORD_MIN_LENGTH = 8;

/**
 * Signup validation
 */
const signupSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required',
    }),
  password: Joi.string()
    .min(PASSWORD_MIN_LENGTH)
    .required()
    .messages({
      'string.min': `Password must be at least ${PASSWORD_MIN_LENGTH} characters long`,
      'any.required': 'Password is required',
    }),
  full_name: Joi.string()
    .max(255)
    .optional()
    .messages({
      'string.max': 'Full name cannot exceed 255 characters',
    }),
  avatar_url: Joi.string()
    .max(2048)
    .optional()
    .messages({
      'string.max': 'Avatar URL cannot exceed 2048 characters',
    }),
})
  .rename('fullName', 'full_name', { ignoreUndefined: true, override: false })
  .strict();

/**
 * Login validation
 */
const loginSchema = object({
  email: string()
    .email()
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required',
    }),
  password: string()
    .required()
    .messages({
      'any.required': 'Password is required',
    }),
}).strict();

/**
 * Forgot password validation
 */
const forgotPasswordSchema = object({
  email: string()
    .email()
    .required()
    .messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required',
    }),
}).strict();

/**
 * Reset password validation
 */
const resetPasswordSchema = object({
  email: string()
    .email()
    .optional()
    .messages({
      'string.email': 'Please provide a valid email address',
    }),
  token: string()
    .optional()
    .messages({
      'any.required': 'Reset token is required',
    }),
  code: string()
    .optional(),
  access_token: string()
    .optional(),
  refresh_token: string()
    .optional(),
  password: string()
    .min(PASSWORD_MIN_LENGTH)
    .required()
    .messages({
      'string.min': `Password must be at least ${PASSWORD_MIN_LENGTH} characters long`,
      'any.required': 'New password is required',
    }),
})
  .or('code', 'access_token', 'token')
  .with('token', 'email')
  .messages({
    'object.missing': 'Reset code, access token, or reset token is required',
    'object.with': 'Email is required when using a reset token',
  })
  .strict();

/**
 * Generic validation function
 */
function validateInput(data, schema) {
  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    const errors = error.details.reduce((acc, detail) => {
      acc[detail.path[0]] = detail.message;
      return acc;
    }, {});
    return { valid: false, errors, value: null };
  }

  return { valid: true, errors: null, value };
}

export default {
  signupSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  validateInput,
};

export {
  signupSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  validateInput,
};
