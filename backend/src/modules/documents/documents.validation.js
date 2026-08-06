import Joi from 'joi';

/**
 * POST /api/documents/extract
 *
 * The file arrives base64-encoded in JSON rather than as multipart. It avoids a
 * multer dependency, and these documents are small — the byte-size limit is
 * enforced in the service once decoded.
 */
export const extractSchema = Joi.object({
  filename: Joi.string().trim().max(255).required().messages({
    'any.required': 'filename is required so the file type can be determined.',
  }),

  mimeType: Joi.string().trim().max(255).allow('', null).default(null),

  base64: Joi.string().base64({ paddingRequired: false }).required().messages({
    'string.base64': 'File content must be base64 encoded.',
  }),
});
