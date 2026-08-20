/**
 * CV Validation Schemas
 *
 * Covers:
 *  - POST /cv/sessions/:sessionId/tailor
 *  - GET  /cv/sessions/:sessionId
 *  - GET  /cv/:id
 */

import Joi from 'joi';

const uuidV4 = () => Joi.string().uuid({ version: 'uuidv4' });

const sessionIdParamValidation = Joi.object({
  sessionId: uuidV4().required().messages({
    'string.guid': 'Session ID must be a valid UUID',
    'any.required': 'Session ID is required',
  }),
});

const cvIdParamValidation = Joi.object({
  id: uuidV4().required().messages({
    'string.guid': 'CV ID must be a valid UUID',
    'any.required': 'CV ID is required',
  }),
});

export { sessionIdParamValidation, cvIdParamValidation };

export default { sessionIdParamValidation, cvIdParamValidation };
