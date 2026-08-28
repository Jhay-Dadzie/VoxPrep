/**
 * Logger Utility
 * Structured logging with different levels
 * Can be extended to use Winston, Pino, or other logging libraries
 */

const isDevelopment = process.env.NODE_ENV === 'development';

const logger = {
  /**
   * Log info level messages
   */
  info: (message, data = null) => {
    const timestamp = new Date().toISOString();
    if (isDevelopment) {
      console.log(`[${timestamp}] INFO: ${message}`, data ? data : '');
    } else {
      console.log(JSON.stringify({
        timestamp,
        level: 'info',
        message,
        data,
      }));
    }
  },

  /**
   * Log error level messages
   */
  error: (message, error = null) => {
    const timestamp = new Date().toISOString();
    if (isDevelopment) {
      console.error(`[${timestamp}] ERROR: ${message}`, error ? error : '');
    } else {
      // `details` and `cause` are where the actual explanation lives when the
      // failure came from a client library: postgrest-js reports a dropped
      // connection as the message "TypeError: fetch failed" and puts the real
      // reason ("Caused by: SocketError: other side closed") in details, and
      // undici puts it in cause. Logging the message alone turned every
      // network fault into the same unactionable line.
      console.error(JSON.stringify({
        timestamp,
        level: 'error',
        message,
        error: error?.message || error,
        ...(error?.details ? { details: `${error.details}`.slice(0, 2000) } : {}),
        ...(error?.hint ? { hint: error.hint } : {}),
        ...(error?.cause ? { cause: `${error.cause}` } : {}),
        ...(error?.stack ? { stack: error.stack } : {}),
      }));
    }
  },

  /**
   * Log warning level messages
   */
  warn: (message, data = null) => {
    const timestamp = new Date().toISOString();
    if (isDevelopment) {
      console.warn(`[${timestamp}] WARN: ${message}`, data ? data : '');
    } else {
      console.warn(JSON.stringify({
        timestamp,
        level: 'warn',
        message,
        data,
      }));
    }
  },

  /**
   * Log debug level messages (development only)
   */
  debug: (message, data = null) => {
    if (isDevelopment) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] DEBUG: ${message}`, data ? data : '');
    }
  },

  /**
   * Log HTTP request
   */
  request: (method, url, statusCode, duration) => {
    const timestamp = new Date().toISOString();
    if (isDevelopment) {
      console.log(`[${timestamp}] ${method} ${url} - ${statusCode} (${duration}ms)`);
    } else {
      console.log(JSON.stringify({
        timestamp,
        level: 'info',
        type: 'http',
        method,
        url,
        statusCode,
        duration,
      }));
    }
  },
};

export default logger;

export const { info, error, warn, debug, request } = logger;
