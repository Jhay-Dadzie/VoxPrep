/**
 * User Validation Schemas
 *
 * Covers:
 *  - updateProfile   → PATCH /users/me
 *  - updateStatus    → PATCH /users/me/status   (active / inactive)
 *  - completeProfile → PATCH /users/me/complete-profile
 *  - adminUpdateUser → PATCH /users/:id  (admin-only, future use)
 */

import Joi from 'joi';

// ─── Reusable primitives ──────────────────────────────────────────────────────

const uuidParam = Joi.object({
  id: Joi.string().uuid({ version: 'uuidv4' }).required().messages({
    'string.guid': 'User ID must be a valid UUID',
    'any.required': 'User ID is required',
  }),
});

// ─── Profile update ───────────────────────────────────────────────────────────

/**
 * PATCH /users/me
 * At least one field must be supplied; all are optional individually.
 */
const updateProfileSchema = Joi.object({
  full_name: Joi.string().trim().min(1).max(255).optional().messages({
    'string.min': 'Full name cannot be empty',
    'string.max': 'Full name cannot exceed 255 characters',
  }),
})
  .min(1) // Reject completely empty payloads
  .messages({
    'object.min': 'At least one field must be provided to update',
  })
  .strict();

// ─── Active / inactive toggle ─────────────────────────────────────────────────

/**
 * PATCH /users/me/status
 * Explicit boolean so clients cannot accidentally toggle with undefined.
 */
const updateStatusSchema = Joi.object({
  is_active: Joi.boolean().required().messages({
    'any.required': 'is_active flag is required',
    'boolean.base': 'is_active must be true or false',
  }),
}).strict();

// ─── Mark profile as complete ─────────────────────────────────────────────────

/**
 * PATCH /users/me/complete-profile
 * Body is intentionally empty — the act of calling the endpoint is the signal.
 * We still validate to reject unexpected fields.
 */
const completeProfileSchema = Joi.object({}).strict().messages({
  'object.unknown': 'No additional fields are accepted for this endpoint',
});

// ─── Generic validator ────────────────────────────────────────────────────────

/**
 * @param {object} data     - Request body / params
 * @param {Joi.Schema} schema
 * @param {object} [options] - Joi validation options overrides
 * @returns {{ valid: boolean, errors: object|null, value: object|null }}
 */
function validateInput(data, schema, options = {}) {
  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
    ...options,
  });

  if (error) {
    const errors = error.details.reduce((acc, detail) => {
      const key = detail.path[0] ?? '_base';
      acc[key] = detail.message;
      return acc;
    }, {});
    return { valid: false, errors, value: null };
  }

  return { valid: true, errors: null, value };
}

export {
  uuidParam,
  updateProfileSchema,
  updateStatusSchema,
  completeProfileSchema,
  validateInput,
};

export default {
  uuidParam,
  updateProfileSchema,
  updateStatusSchema,
  completeProfileSchema,
  validateInput,
};
