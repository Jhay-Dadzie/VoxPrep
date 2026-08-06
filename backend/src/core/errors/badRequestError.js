import AppError from './appError.js';

/** The client sent something we cannot act on. */
export default class BadRequestError extends AppError {
  constructor(message = 'Bad request', details = undefined) {
    super(message, 400, details);
  }
}
