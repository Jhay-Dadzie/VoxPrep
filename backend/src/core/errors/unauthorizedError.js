import AppError from './appError.js';

/** No valid credentials, or credentials that do not permit this action. */
export default class UnauthorizedError extends AppError {
  constructor(message = 'Not authorized') {
    super(message, 401);
  }
}
