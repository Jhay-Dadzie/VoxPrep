/**
 * Simplified Authentication Controller
 * Only: signup, login, logout, forgot-password, reset-password
 */

import authService from './auth.service.js';
import { validateInput, signupSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema } from './auth.validation.js';
import { info, error as _error } from '../../core/errors/logger.js';

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

      const { email, password, full_name } = value;
      const result = await authService.signup({ email, password, full_name });

      info(`New user registered: ${email}`);

      return res.status(201).json({
        success: true,
        message: result.message,
        data: {
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
      const cleanedBody = Object.fromEntries(
        Object.entries(req.body).filter(([, value]) => value !== '')
      );
      const { valid, errors, value } = validateInput(cleanedBody, resetPasswordSchema);
      if (!valid) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors,
        });
      }

      const { email, token, password, code, access_token, refresh_token } = value;
      const result = await authService.resetPassword({
        email,
        token,
        password,
        code,
        access_token,
        refresh_token,
      });

      info(`Password reset completed for: ${email}`);

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
   * GET /auth/reset-password
   */
  async showResetPassword(req, res) {
    const code = req.query.code || '';
    const error = req.query.error_description || req.query.error || '';

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'"
    );

    return res.status(error ? 400 : 200).send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Reset password</title>
  <style>
    body {
      align-items: center;
      background: #f7f7f8;
      color: #151515;
      display: flex;
      font-family: Arial, sans-serif;
      justify-content: center;
      margin: 0;
      min-height: 100vh;
    }
    main {
      background: #ffffff;
      border: 1px solid #dedee3;
      border-radius: 8px;
      max-width: 420px;
      padding: 24px;
      width: calc(100% - 32px);
    }
    label, input, button {
      display: block;
      width: 100%;
    }
    label {
      font-size: 14px;
      margin: 16px 0 6px;
    }
    input {
      border: 1px solid #c9c9d1;
      border-radius: 6px;
      box-sizing: border-box;
      font-size: 16px;
      padding: 10px 12px;
    }
    button {
      background: #151515;
      border: 0;
      border-radius: 6px;
      color: #ffffff;
      cursor: pointer;
      font-size: 16px;
      margin-top: 18px;
      padding: 11px 12px;
    }
    .error {
      color: #b42318;
      margin: 0 0 12px;
    }
  </style>
</head>
<body>
  <main>
    <h1>Reset password</h1>
    ${error ? `<p class="error">${String(error).replace(/[<>&"]/g, '')}</p>` : ''}
    <form method="post" action="/api/v1/auth/reset-password">
      <input type="hidden" name="code" value="${String(code).replace(/[<>&"]/g, '')}">
      <input type="hidden" name="access_token" value="">
      <input type="hidden" name="refresh_token" value="">
      <label for="password">New password</label>
      <input id="password" name="password" type="password" minlength="8" autocomplete="new-password" required>
      <button type="submit">Update password</button>
    </form>
  </main>
  <script>
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const searchParams = new URLSearchParams(window.location.search);
    const code = searchParams.get('code');
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');

    if (code) {
      document.querySelector('input[name="code"]').value = code;
    }
    if (accessToken) {
      document.querySelector('input[name="access_token"]').value = accessToken;
    }
    if (refreshToken) {
      document.querySelector('input[name="refresh_token"]').value = refreshToken;
    }
  </script>
</body>
</html>`);
  }

  /**
   * POST /auth/logout
   */
  async logout(req, res) {
    try {
      const userId = req.user?.id;

      await authService.logout(userId);

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
