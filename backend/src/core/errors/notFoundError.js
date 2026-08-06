import AppError from './appError.js';

/** The addressed resource does not exist, or is not visible to this caller. */
export default class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404);
  }
}
