import { AppError } from './appError';

class BadRequestError extends AppError {
  constructor(message = 'Bad Request') {
    super(message, 400);
  }
}

export default {
  BadRequestError,
};