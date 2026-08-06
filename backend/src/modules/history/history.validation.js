/**
 * History Validation Schemas
 *
 * Covers:
 *  - getHistory      → GET  /history            (query: pagination/search/sort)
 *  - getHistoryById  → GET  /history/:id         (param: uuid)
 *  - archiveSession  → PATCH /history/:id/archive
 *  - updateNotes     → PATCH /history/:id/notes
 *  - deleteSession   → DELETE /history/:id       (param: uuid)
 */

import Joi from 'joi';

// ─── Params ───────────────────────────────────────────────────────────────────

const uuidParam = Joi.object({
  id: Joi.string().uuid({ version: 'uuidv4' }).required().messages({
    'string.guid': 'Session ID must be a valid UUID',
    'any.required': 'Session ID is required',
  }),
});

// ─── GET /history query ───────────────────────────────────────────────────────

/**
 * sort:
 *   recent      → started_at desc (default — most recently attempted first)
 *   oldest      → started_at asc
 *   score_desc  → overall_score desc (best performance first)
 *   score_asc   → overall_score asc  (weakest performance first, for targeted review)
 */
const historyQueryValidation = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  search: Joi.string().trim().max(255).optional().allow(''),
  sort: Joi.string()
    .valid('recent', 'oldest', 'score_desc', 'score_asc')
    .default('recent'),
});

// ─── PATCH /history/:id/archive ───────────────────────────────────────────────

const archiveValidation = Joi.object({
  is_archived: Joi.boolean().required().messages({
    'any.required': 'is_archived flag is required',
    'boolean.base': 'is_archived must be true or false',
  }),
}).strict();

// ─── PATCH /history/:id/notes ─────────────────────────────────────────────────

const notesValidation = Joi.object({
  // Explicit null/'' is how a client clears notes — keep it required so an
  // empty PATCH body can't silently no-op.
  notes: Joi.string().trim().max(2000).allow('', null).required().messages({
    'string.max': 'Notes cannot exceed 2000 characters',
    'any.required': 'notes field is required (send an empty string to clear it)',
  }),
}).strict();

export { uuidParam, historyQueryValidation, archiveValidation, notesValidation };

export default {
  uuidParam,
  historyQueryValidation,
  archiveValidation,
  notesValidation,
};