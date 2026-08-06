import AppError from '../errors/appError.js';

/**
 * Terminal error handler.
 *
 * Express 5 forwards rejected promises from async handlers here automatically,
 * so route handlers do not need their own try/catch.
 *
 * Anything that is not an AppError is treated as a bug: logged in full, and
 * reported to the client as a bare 500. Upstream failures (OpenAI, Supabase)
 * can carry provider detail in their messages, so they must never be echoed.
 */
export function errorHandler(err, req, res, _next) {
  // body-parser rejects oversized or malformed bodies before any route runs.
  // These are the caller's problem and must say so, not hide behind a 500.
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      message: 'That file is too large to upload. The limit is 8MB.',
    });
  }

  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      message: 'The request body was not valid JSON.',
    });
  }

  const isKnown = err instanceof AppError && err.isOperational;
  const status = isKnown ? err.statusCode : 500;

  if (!isKnown) {
    console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  }

  res.status(status).json({
    success: false,
    message: isKnown ? err.message : 'Something went wrong on our end.',
    ...(isKnown && err.details ? { details: err.details } : {}),
  });
}

/** Nothing matched — must sit after all routes and before errorHandler. */
export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
}
