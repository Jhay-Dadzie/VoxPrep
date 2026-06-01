/**
 * Simplified Authentication Service
 * Optimized for: Email/Password only, basic login/signup/password-reset
 */

import {
  getSupabaseAdminClient,
  getSupabaseClient,
  getSupabaseClientForToken,
  initializeUserProfile,
} from '../../config/supabase.js';
import { error as _error, info, warn } from '../../core/errors/logger.js';
import {
  getCurrentTestUser,
  getTestGoogleOAuthUrl,
  loginTestUser,
  logoutTestUser,
  shouldUseTestAuth,
  signupTestUser,
  verifyTestEmail,
} from './auth.store.js';

function getBaseUrl(envKey, fallbackPort) {
  const value = process.env[envKey]?.trim();
  if (value) {
    return value.replace(/\/+$/, '');
  }

  return `http://localhost:${process.env.PORT || fallbackPort}`;
}

function generateRandomAvatarUrl(email, fullName) {
  const name = encodeURIComponent(fullName || email.split('@')[0] || 'user');
  // UI Avatars – free, consistent, no API key
  return `https://ui-avatars.com/api/?name=${name}&background=random&size=128&bold=true`;
}

class AuthService {
  async _getOAuthLoginHint(email) {
    if (!email || shouldUseTestAuth()) {
      return null;
    }

    try {
      const adminClient = getSupabaseAdminClient();
      const normalizedEmail = email.trim().toLowerCase();
      const pageSize = 100;

      for (let page = 1; page < 100; page += 1) {
        const { data, error } = await adminClient.auth.admin.listUsers({
          page,
          perPage: pageSize,
        });

        if (error) {
          warn(`Failed to inspect auth user for ${email}:`, error);
          return null;
        }

        const users = Array.isArray(data?.users) ? data.users : Array.isArray(data) ? data : [];
        const matchedUser = users.find(
          (user) => user.email?.trim().toLowerCase() === normalizedEmail,
        );

        if (matchedUser) {
          const providers = Array.isArray(matchedUser.app_metadata?.providers)
            ? matchedUser.app_metadata.providers
            : [];
          const primaryProvider = matchedUser.app_metadata?.provider || null;
          const hasPasswordIdentity = providers.includes('email') || primaryProvider === 'email';

          if (!hasPasswordIdentity) {
            return 'This account was created with Google. Please sign in with Google instead of email and password.';
          }

          return null;
        }

        if (users.length < pageSize) {
          return null;
        }
      }
    } catch (error) {
      warn(`Failed to determine login provider for ${email}:`, error);
    }

    return null;
  }

  /**
   * Sign up a new user.
   * If email confirmation is enabled in Supabase, no session is returned.
   */
  async signup({ email, password, full_name, avatar_url }) {
    try {
      if (shouldUseTestAuth()) {
        const result = signupTestUser({ email, password, full_name });
        if (result.session) {
          info(`User profile created for ${email}`);
        } else {
          info(`Signup pending verification for ${email}`);
        }
        return result;
      }

      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: full_name || null,
          },
        },
      });

      if (error) {
        _error('Signup auth error:', error);
        throw new Error(error.message || 'Failed to create user account');
      }

      const { user, session } = data;

      if (!user) {
        throw new Error('User not created');
      }

      // If email confirmation is required, session will be null
      if (!session) {
        info(`Signup pending verification for ${email}`);
        return {
          user: { id: user.id, email: user.email, full_name, avatar_url: avatar_url || null },
          session: null,
          message: 'Verification email sent. Please confirm your email address.',
        };
      }

      // Email confirmation disabled – create profile and return session
      try {
        const avatarUrl = avatar_url || generateRandomAvatarUrl(email, full_name);
        await initializeUserProfile(user.id, email, full_name, session.access_token, avatarUrl);
        info(`User profile created for ${email}`);
      } catch (profileError) {
        _error(`Failed to create user profile for ${email}:`, profileError);
      }

      await this._logAudit({
        user_id: user.id,
        action: 'signup',
        resource_type: 'user',
        resource_id: user.id,
      });

      return {
        user: {
          id: user.id,
          email: user.email,
          full_name,
          avatar_url: avatar_url || generateRandomAvatarUrl(email, full_name),
        },
        session: {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_in: session.expires_in,
          expires_at: session.expires_at,
          token_type: session.token_type,
        },
        message: 'Signup successful',
      };
    } catch (error) {
      _error('Signup error:', error);
      throw error;
    }
  }

  async login({ email, password }) {
    try {
      if (shouldUseTestAuth()) {
        return loginTestUser({ email, password });
      }

      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        warn(`Login failed for ${email}: ${error.message}`);
        if (error.message === 'Email not confirmed') {
          throw new Error('Please verify your email address before logging in.');
        }
        if (error.message === 'Invalid login credentials') {
          const oauthHint = await this._getOAuthLoginHint(email);
          if (oauthHint) {
            throw new Error(oauthHint);
          }
        }
        throw new Error(error.message || 'Invalid email or password');
      }

      const { user, session } = data;
      let userProfile = null;

      if (session?.access_token) {
        const userSupabase = getSupabaseClientForToken(session.access_token);
        const { data } = await userSupabase
          .from('users')
          .select('*')
          .eq('id', user.id)
          .single();
        userProfile = data;
      }

      await this._logAudit({
        user_id: user.id,
        action: 'login',
        resource_type: 'user',
        resource_id: user.id,
      });

      return {
        user: {
          id: user.id,
          email: user.email,
          full_name: userProfile?.full_name || null,
          avatar_url: userProfile?.avatar_url || null,
        },
        session: {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_in: session.expires_in,
          expires_at: session.expires_at,
          token_type: session.token_type,
        },
      };
    } catch (error) {
      _error('Login error:', error);
      throw error;
    }
  }

  /**
   * Google OAuth – get the URL to redirect the user to
   */
  async googleSignIn() {
    const redirectTo = `${getBaseUrl('BACKEND_URL', 3000)}/api/v1/auth/google/callback`;

    if (shouldUseTestAuth()) {
      return { url: getTestGoogleOAuthUrl(redirectTo) };
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    if (error) throw new Error(error.message);
    return { url: data.url };
  }

  /**
   * Exchange OAuth code for a session
   */
  async handleGoogleCallback(code) {
    if (shouldUseTestAuth()) {
      return this._handleTestGoogleCallback(code);
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw new Error(error.message);
    const { user, session } = data;

    // Ensure user profile exists
    const googleAvatar = user.user_metadata?.avatar_url || user.user_metadata?.picture || null;
    await initializeUserProfile(user.id, user.email, user.user_metadata?.full_name, session.access_token, googleAvatar);

    await this._logAudit({
      user_id: user.id,
      action: 'google_login',
      resource_type: 'user',
      resource_id: user.id,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || null,
        avatar_url: googleAvatar,
      },
      session: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_in: session.expires_in,
        expires_at: session.expires_at,
        token_type: session.token_type,
      },
    };
  }

  /**
   * Verify email using token from confirmation link
   */
  async verifyEmail(token) {
    if (shouldUseTestAuth()) {
        return verifyTestEmail(token);
      }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: token,
      type: 'signup',
    });
    if (error) throw new Error(error.message);

    // If email confirmation is enabled, create profile now with an avatar
    // (only if not already created by some other flow)
      const { user } = data;
      const avatarUrl = generateRandomAvatarUrl(user.email, user.user_metadata?.full_name);
      try {
      // Use admin client because the user may not have an active session
      const adminClient = getSupabaseAdminClient();
      // Check if profile already exists
      const { data: existing } = await adminClient
        .from('users')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();
      if (!existing) {
        await initializeUserProfile(user.id, user.email, user.user_metadata?.full_name, null, avatarUrl);
      }
    } catch (err) {
      warn('Failed to create user profile after email verification:', err);
    }

    return { message: 'Email verified successfully' };
  }

  async logout(accessToken, userId) {
    try {
      if (!accessToken) {
        throw new Error('Access token required');
      }

      if (shouldUseTestAuth()) {
        return logoutTestUser(accessToken, userId);
      }

      const { error } = await getSupabaseClientForToken(accessToken).auth.signOut();

      if (error) {
        throw new Error(error.message || 'Logout failed');
      }

      await this._logAudit({
        user_id: userId,
        action: 'logout',
        resource_type: 'user',
        resource_id: userId,
      });

      return { message: 'Logout successful' };
    } catch (error) {
      _error('Logout error:', error);
      throw error;
    }
  }

  async forgotPassword(email) {
    try {
      if (shouldUseTestAuth()) {
        return { message: 'If an account exists with this email, a password reset link will be sent' };
      }

      const supabase = getSupabaseClient();
      const redirectTo = `${getBaseUrl('FRONTEND_URL', 3000)}/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      });

      if (error) {
        _error('Forgot password error:', error);
        throw new Error(error.message || 'Failed to send password reset email');
      }

      return { message: 'If an account exists with this email, a password reset link will be sent' };
    } catch (error) {
      _error('Forgot password service error:', error);
      throw error;
    }
  }

  async resetPassword({ email, token, password }) {
    try {
      if (shouldUseTestAuth()) {
        return { message: 'Password reset successful. Please log in with your new password.' };
      }

      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'recovery',
      });

      if (error) {
        warn('Password reset token verification failed:', error.message);
        throw new Error('Invalid or expired reset token');
      }

      if (!data.session?.access_token) {
        throw new Error('Invalid or expired reset token');
      }

      const recoverySupabase = getSupabaseClientForToken(data.session.access_token);
      const { error: updateError } = await recoverySupabase.auth.updateUser({
        password,
      });

      if (updateError) {
        _error('Password update error:', updateError);
        throw new Error(updateError.message || 'Failed to update password');
      }

      return { message: 'Password reset successful. Please log in with your new password.' };
    } catch (error) {
      _error('Reset password error:', error);
      throw error;
    }
  }

  async getCurrentUser(accessToken) {
    try {
      if (shouldUseTestAuth()) {
        return getCurrentTestUser(accessToken);
      }

      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.getUser(accessToken);

      if (error) {
        throw new Error('Invalid or expired token');
      }

      const authUser = data.user;
      const userSupabase = getSupabaseClientForToken(accessToken);
      const { data: userProfile } = await userSupabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single();

      return {
        id: authUser.id,
        email: authUser.email,
        full_name: userProfile?.full_name || null,
        avatar_url: userProfile?.avatar_url || null,
        avatar_updated_at: userProfile?.avatar_updated_at || null,
        created_at: userProfile?.created_at || null,
      };
    } catch (error) {
      _error('Get current user error:', error);
      throw error;
    }
  }

  async _logAudit({ user_id, action, resource_type, resource_id, details = null }) {
    const supabase = getSupabaseClient();

    try {
      await supabase.from('audit_log').insert([
        {
          user_id,
          action,
          resource_type,
          resource_id,
          details,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (error) {
      warn('Failed to log audit trail:', error);
    }
  }

  async _handleTestGoogleCallback(code) {
    if (!code) {
      throw new Error('Missing authorization code');
    }

    return {
      user: {
        id: `google-${code}`,
        email: `google-${code}@example.com`,
        full_name: null,
        avatar_url: null,
      },
      session: {
        access_token: `test-access.${code}`,
        refresh_token: `test-refresh.${code}`,
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'bearer',
      },
    };
  }
}

export default new AuthService();
