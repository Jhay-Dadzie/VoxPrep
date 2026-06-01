/**
 * Simplified Authentication Controller
 * Only: signup, login, logout, forgot-password, reset-password
 */

import authService from './auth.service.js';
import { validateInput, signupSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema } from './auth.validation.js';
import { info, error as _error } from '../../core/errors/logger.js';

const REFRESH_TOKEN_COOKIE = 'refresh_token';

function setRefreshTokenCookie(res, refreshToken) {
  if (!refreshToken) {
    return;
  }

  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}

function clearRefreshTokenCookie(res) {
  res.clearCookie(REFRESH_TOKEN_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}

class AuthController {
  /**
   * POST /auth/signup
   */
  async signup(req, res) {
    try {
      const { valid, errors, value } = validateInput(req.body, signupSchema);
      if (!valid) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors,
        });
      }

      const { email, password, full_name, avatar_url } = value;
      const result = await authService.signup({ email, password, full_name, avatar_url });

      info(`New user registered: ${email}`);

      if (!result.session) {
        // Email verification required
        return res.status(201).json({
          success: true,
          message: result.message,
          data: {
            user: result.user,
            session: null,
          },
        });
      }

      setRefreshTokenCookie(res, result.session?.refresh_token);

      return res.status(201).json({
        success: true,
        message: result.message,
        data: {
          id: result.user.id,
          email: result.user.email,
          full_name: result.user.full_name,
          avatar_url: result.user.avatar_url,
          user: result.user,
          session: result.session,
        },
      });
    } catch (error) {
      _error('Signup controller error:', error);

      if (error.message.includes('already registered')) {
        return res.status(409).json({
          success: false,
          message: 'Email already registered',
        });
      }

      return res.status(500).json({
        success: false,
        message: error.message || 'Signup failed',
      });
    }
  }

  /**
   * POST /auth/login
   */
  async login(req, res) {
    try {
      const { valid, errors, value } = validateInput(req.body, loginSchema);
      if (!valid) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors,
        });
      }

      const { email, password } = value;
      const result = await authService.login({ email, password });

      info(`User logged in: ${email}`);
      setRefreshTokenCookie(res, result.session?.refresh_token);

      return res.status(200).json({
        success: true,
        message: 'Login successful',
        data: {
          user: result.user,
          session: result.session,
        },
      });
    } catch (error) {
      _error('Login controller error:', error);

      return res.status(401).json({
        success: false,
        message: error.message || 'Login failed',
      });
    }
  }

  /**
   * GET /auth/google
   * Initiate Google OAuth
   */
  async googleAuth(req, res) {
    try {
      const { url } = await authService.googleSignIn();
      return res.status(200).json({ success: true, url });
    } catch (error) {
      _error('Google OAuth init error:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * GET /auth/google/callback
   * Handle Google OAuth callback
   */
  async googleCallback(req, res) {
    try {
      const { code } = req.query;
      if (!code) {
        return res.status(400).json({ success: false, message: 'Missing authorization code' });
      }
      const result = await authService.handleGoogleCallback(code);
      setRefreshTokenCookie(res, result.session?.refresh_token);
      return res.status(200).json({
        success: true,
        message: 'Google login successful',
        data: result,
      });
    } catch (error) {
      _error('Google callback error:', error);
      return res.status(401).json({ success: false, message: error.message });
    }
  }

  /**
   * GET /auth/verify-email
   * Verify email using token from Supabase confirmation link
   */
  async verifyEmail(req, res) {
    try {
      const { token } = req.query;
      if (!token) {
        return res.status(400).json({ success: false, message: 'Verification token missing' });
      }
      const result = await authService.verifyEmail(token);
      if (process.env.FRONTEND_URL) {
        return res.redirect(`${process.env.FRONTEND_URL}/login?verified=true`);
      }
      return res.status(200).json({ success: true, message: result.message });
    } catch (error) {
      _error('Email verification error:', error);
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * POST /auth/forgot-password
   */
  async forgotPassword(req, res) {
    try {
      const { valid, errors, value } = validateInput(req.body, forgotPasswordSchema);
      if (!valid) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors,
        });
      }

      const { email } = value;
      const result = await authService.forgotPassword(email);

      info(`Password reset requested for: ${email}`);

      return res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      _error('Forgot password controller error:', error);

      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to process password reset request',
      });
    }
  }

  /**
   * POST /auth/reset-password
   */
  async resetPassword(req, res) {
    try {
      const { valid, errors, value } = validateInput(req.body, resetPasswordSchema);
      if (!valid) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors,
        });
      }

      const { email, token, code, access_token, password } = value;
      const result = await authService.resetPassword({
        email,
        token,
        code,
        access_token,
        password,
      });

      info(`Password reset completed${email ? ` for: ${email}` : ''}`);

      return res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      _error('Reset password controller error:', error);

      return res.status(400).json({
        success: false,
        message: error.message || 'Password reset failed',
      });
    }
  }

  /**
   * POST /auth/logout
   */
  async logout(req, res) {
    try {
      const userId = req.user?.id;
      const accessToken = req.token || req.headers.authorization?.split(' ')[1];

      await authService.logout(accessToken, userId);
      clearRefreshTokenCookie(res);

      return res.status(200).json({
        success: true,
        message: 'Logout successful',
      });
    } catch (error) {
      _error('Logout controller error:', error);

      return res.status(200).json({
        success: true,
        message: 'Logout completed',
      });
    }
  }

  /**
   * GET /auth/me
   */
  async getCurrentUser(req, res) {
    try {
      const accessToken = req.headers.authorization?.split(' ')[1];

      if (!accessToken) {
        return res.status(401).json({
          success: false,
          message: 'Access token required',
        });
      }

      const user = await authService.getCurrentUser(accessToken);

      return res.status(200).json({
        success: true,
        message: 'User retrieved successfully',
        data: user,
      });
    } catch (error) {
      _error('Get current user controller error:', error);

      return res.status(401).json({
        success: false,
        message: error.message || 'Failed to retrieve user',
      });
    }
  }
}

export default new AuthController();
