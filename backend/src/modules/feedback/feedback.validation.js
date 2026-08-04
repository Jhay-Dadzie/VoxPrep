/**
 * Feedback Validation Schemas
 *
 * Covers:
 *  - POST /feedback/sessions/:sessionId/generate
 *  - GET  /feedback/sessions/:sessionId
 *  - GET  /feedback/sessions/:sessionId/summary
 *  - GET  /feedback/responses/:responseId
 *  - POST /feedback/responses/:responseId/regenerate
 */

import Joi from 'joi';

const uuidV4 = () =>
  Joi.string().uuid({ version: 'uuidv4' });

const sessionIdParamValidation = Joi.object({
  sessionId: uuidV4().required().messages({
    'string.guid': 'Session ID must be a valid UUID',
    'any.required': 'Session ID is required',
  }),
});

const responseIdParamValidation = Joi.object({
  responseId: uuidV4().required().messages({
    'string.guid': 'Response ID must be a valid UUID',
    'any.required': 'Response ID is required',
  }),
});

/**
 * ?force=true re-grades every response in the session, including ones that
 * already have completed feedback. Default only grades ungraded/failed ones,
 * making POST /generate safe to call repeatedly (e.g. client retry after a
 * flaky network call) without burning extra AI credits.
 */
const generateSessionFeedbackQueryValidation = Joi.object({
  force: Joi.boolean().truthy('true').falsy('false').default(false),
});

export {
  sessionIdParamValidation,
  responseIdParamValidation,
  generateSessionFeedbackQueryValidation,
};

export default {
  sessionIdParamValidation,
  responseIdParamValidation,
  generateSessionFeedbackQueryValidation,
};