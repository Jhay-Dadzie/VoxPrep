import { AppError } from './appError';

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized access') {
    super(message, 401);
  }
}

export default {
  UnauthorizedError,
};