/**
 * Simplified Authentication Routes
 * Pattern: /api/v1/auth/*
 * 
 * Endpoints:
 * - POST   /signup
 * - POST   /login
 * - POST   /logout (protected)
 * - POST   /change-password (protected)
 * - GET    /me (protected)
 * - POST   /forgot-password
 * - POST   /reset-password
 * - GET    /google (OAuth init)
 * - GET    /google/callback (OAuth callback)
 * - GET    /verify-email (email confirmation)
 */

import { Router } from 'express';
const router = Router();
import authController from './auth.controller.js';
import { signupLimiter, loginLimiter, passwordLimiter, protect } from './auth.middleware.js';

const asyncHandler = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

/**
 * PUBLIC ENDPOINTS
 */

/**
 * POST /api/v1/auth/signup
 * Register new user (email confirmation based on Supabase settings)
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
 * GET /api/v1/auth/google
 * Initiate Google OAuth login
 */
router.get('/google', asyncHandler(authController.googleAuth.bind(authController)));

/**
 * GET /api/v1/auth/google/callback
 * Google OAuth callback (handled by Supabase)
 */
router.get('/google/callback', asyncHandler(authController.googleCallback.bind(authController)));

/**
 * GET /api/v1/auth/verify-email
 * Verify email address (called from Supabase confirmation link)
 * Query: ?email=user@example.com&token=123456
 */
router.get('/verify-email', asyncHandler(authController.verifyEmail.bind(authController)));

/**
 * POST /api/v1/auth/resend-verification
 * Body: { email }
 */
router.post(
  '/resend-verification',
  signupLimiter,
  asyncHandler(authController.resendVerification.bind(authController))
);

/**
 * POST /api/v1/auth/verify-password-reset-otp
 * Body: { email, token }
 */
router.post(
  '/verify-password-reset-otp',
  passwordLimiter,
  asyncHandler(authController.verifyPasswordResetOtp.bind(authController))
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
 * POST /api/v1/auth/change-password
 * Body: { current_password, new_password }
 */
router.post(
  '/change-password',
  protect,
  passwordLimiter,
  asyncHandler(authController.changePassword.bind(authController))
);

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
