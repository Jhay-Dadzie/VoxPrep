/**
 * Base class for errors we raise deliberately.
 *
 * `isOperational` marks the difference between "the request was bad" and "the
 * process is broken". Operational errors are safe to describe to the client;
 * anything else is logged and reported as a generic 500.
 */
export default class AppError extends Error {
  constructor(message, statusCode = 500, details = undefined) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = true;
    if (details !== undefined) this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}
