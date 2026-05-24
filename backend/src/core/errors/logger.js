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
      console.error(JSON.stringify({
        timestamp,
        level: 'error',
        message,
        error: error?.message || error,
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
