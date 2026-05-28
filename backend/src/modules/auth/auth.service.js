/**
 * Simplified Authentication Service
 * Optimized for: Email/Password only, basic login/signup/password-reset
 */

import { getSupabaseClient, getSupabaseClientForToken, initializeUserProfile } from '../../config/supabase.js';
import { error as _error, info, warn } from '../../core/errors/logger.js';

class AuthService {
  /**
   * Sign up a new user and return the Supabase session.
   * Supabase only returns a session here when email confirmation is disabled.
   */
  async signup({ email, password, full_name }) {
    const supabase = getSupabaseClient();

    try {
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

      if (!session) {
        throw new Error(
          'Signup created the user, but Supabase did not return a session. Disable email confirmation in Supabase Authentication settings to automatically sign users in after signup.'
        );
      }

      try {
        await initializeUserProfile(user.id, email, full_name, session.access_token);
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
    const supabase = getSupabaseClient();

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        warn(`Login failed for ${email}: ${error.message}`);
        throw new Error(error.message || 'Invalid email or password');
      }

      const { user, session } = data;
      const { data: userProfile } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

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

  async forgotPassword(email) {
    const supabase = getSupabaseClient();

    try {
      const baseUrl = process.env.BACKEND_URL || process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${baseUrl}/api/v1/auth/reset-password`,
      });

      if (error) {
        warn(`Password reset request was not sent for ${email}: ${error.message}`);
      }

      return { message: 'If an account exists with this email, a password reset link will be sent' };
    } catch (error) {
      _error('Forgot password service error:', error);
      throw error;
    }
  }

  async logout(userId) {
    try {
      await getSupabaseClient().auth.signOut();

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


  async resetPassword({ email, token, password, code, access_token, refresh_token }) {
    const supabase = getSupabaseClient();

    try {
      if (access_token) {
        if (!refresh_token) {
          throw new Error('Reset link is missing a refresh token');
        }

        const recoveryClient = getSupabaseClientForToken(access_token);
        const { error: sessionError } = await recoveryClient.auth.setSession({
          access_token,
          refresh_token,
        });

        if (sessionError) {
          warn('Password reset session setup failed:', sessionError.message);
          throw new Error('Invalid or expired reset link');
        }

        const { error: updateError } = await recoveryClient.auth.updateUser({
          password,
        });

        if (updateError) {
          _error('Password update error:', updateError);
          throw new Error(updateError.message || 'Failed to update password');
        }

        return { message: 'Password reset successful. Please log in with your new password.' };
      }

      if (code) {
        const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

        if (exchangeError) {
          warn('Password reset code exchange failed:', exchangeError.message);
          throw new Error('Invalid or expired reset link');
        }

        if (!data.session) {
          throw new Error('Invalid or expired reset link');
        }

        const { error: sessionError } = await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });

        if (sessionError) {
          warn('Password reset session setup failed:', sessionError.message);
          throw new Error('Invalid or expired reset link');
        }

        const { error: updateError } = await supabase.auth.updateUser({
          password,
        });

        if (updateError) {
          _error('Password update error:', updateError);
          throw new Error(updateError.message || 'Failed to update password');
        }

        return { message: 'Password reset successful. Please log in with your new password.' };
      }

      if (email && token) {
        const { data, error } = await supabase.auth.verifyOtp({
          email,
          token,
          type: 'recovery',
        });

        if (error) {
          warn('Password reset token verification failed:', error.message);
          throw new Error('Invalid or expired reset token');
        }

        if (!data.session) {
          throw new Error('Invalid or expired reset token');
        }

        const { error: sessionError } = await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });

        if (sessionError) {
          warn('Password reset session setup failed:', sessionError.message);
          throw new Error('Invalid or expired reset token');
        }

        const { error: updateError } = await supabase.auth.updateUser({
          password,
        });

        if (updateError) {
          _error('Password update error:', updateError);
          throw new Error(updateError.message || 'Failed to update password');
        }

        return { message: 'Password reset successful. Please log in with your new password.' };
      }

      throw new Error('Reset code, access token, or reset token is required');
    } catch (error) {
      _error('Reset password error:', error);
      throw error;
    }
  }

  async getCurrentUser(accessToken) {
    const supabase = getSupabaseClient();

    try {
      const { data, error } = await supabase.auth.getUser(accessToken);

      if (error) {
        throw new Error('Invalid or expired token');
      }

      const authUser = data.user;
      const { data: userProfile } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single();

      return {
        id: authUser.id,
        email: authUser.email,
        full_name: userProfile?.full_name || null,
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
}

export default new AuthService();
