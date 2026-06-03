/**
 * Standardized API Response Helper
 */
export const successResponse = (res, data = null, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({
    status: 'success',
    message,
    data,
  });
};

export const errorResponse = (res, message = 'Error', statusCode = 500, errors = null) => {
  return res.status(statusCode).json({
    status: 'error',
    message,
    ...(errors && { errors }),
  });
};

export default {
  successResponse,
  errorResponse,
};