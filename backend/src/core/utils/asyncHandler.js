/**
 * Async Handler Wrapper
 * Catches errors in async route handlers and passes them to Express error middleware
 */
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    return Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export default {
  asyncHandler,
};
