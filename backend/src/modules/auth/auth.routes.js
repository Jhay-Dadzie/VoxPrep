/**
 * Simplified Authentication Routes
 * Pattern: /api/v1/auth/*
 * 
 * Endpoints:
 * - POST   /signup
 * - POST   /login
 * - POST   /logout (protected)
 * - GET    /me (protected)
 * - POST   /forgot-password
 * - POST   /reset-password
 */

import { Router } from 'express';
const router = Router();
import authController from './auth.controller.js';
// import authController, { signup, login, forgotPassword, resetPassword, getCurrentUser, logout } from './auth.controller';
import { signupLimiter, loginLimiter, passwordLimiter, protect } from './auth.middleware.js';

const asyncHandler = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

/**
 * PUBLIC ENDPOINTS
 */

/**
 * POST /api/v1/auth/signup
 * Register new user (auto-confirmed)
 * Body: { email, password, full_name? }
 */
router.post(
  '/signup',
  signupLimiter,
  asyncHandler(authController.signup.bind(authController))
);

/**
 * POST /api/v1/auth/login
 * Authenticate user
 * Body: { email, password }
 */
router.post(
  '/login',
  loginLimiter,
  asyncHandler(authController.login.bind(authController))
);

/**
 * POST /api/v1/auth/forgot-password
 * Request password reset email
 * Body: { email }
 */
router.post(
  '/forgot-password',
  passwordLimiter,
  asyncHandler(authController.forgotPassword.bind(authController))
);

/**
 * POST /api/v1/auth/reset-password
 * Reset password with token from email
 * Body: { email, token, password }
 */
router.post(
  '/reset-password',
  passwordLimiter,
  asyncHandler(authController.resetPassword.bind(authController))
);

/**
 * PROTECTED ENDPOINTS
 */

/**
 * GET /api/v1/auth/me
 * Get current authenticated user
 * Headers: Authorization: Bearer <access_token>
 */
router.get('/me', protect, asyncHandler(authController.getCurrentUser.bind(authController)));

/**
 * POST /api/v1/auth/logout
 * Logout user
 * Headers: Authorization: Bearer <access_token>
 */
router.post('/logout', protect, asyncHandler(authController.logout.bind(authController)));

/**
 * Health check
 */
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Auth service is healthy',
  });
});

export default router;
