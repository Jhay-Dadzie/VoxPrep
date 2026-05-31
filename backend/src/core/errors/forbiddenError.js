import { AppError } from './appError';

class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403);
  }
}

export default {
  ForbiddenError,
};