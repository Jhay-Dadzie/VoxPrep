/**
 * Simplified Authentication Service
 * Optimized for: Email/Password only, auto-confirm, basic login/signup/password-reset
 */

import { getSupabaseClient, initializeUserProfile } from '../../config/supabase.js';
import { error as _error, info, warn } from '../../core/errors/logger.js';

class AuthService {
  /**
   * Sign up a new user
   * Auto-confirms account (no email verification needed)
   */
  async signup({ email, password, full_name }) {
    const supabase = getSupabaseClient();
  
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name }
      }
    });
  
    if (error) throw error;
  
    const user = data.user;
  
    if (!user) {
      throw new Error("User not created (check email confirmation settings)");
    }
  
    return {
      user: {
        id: user.id,
        email: user.email,
        full_name
      },
      message: "Signup successful"
    };
  }

  /**
   * Log in user with email and password
   * Returns access token (no refresh token complexity)
   */
//   async login({ email, password }) {
//     const supabase = getSupabaseClient();

//     try {
//       const { data, error } = await supabase.auth.signInWithPassword({
//         email,
//         password,
//       });

//       if (error) {
//         warn(`Login failed for ${email}: ${error.message}`);
//         throw new Error(error.message || 'Invalid email or password');
//       }

//       const { user, session } = data;

//       // Get user profile
//       const { data: userProfile } = await supabase
//         .from('users')
//         .select('*')
//         .eq('id', user.id)
//         .single();

//       // Log the login action
//       await this._logAudit({
//         user_id: user.id,
//         action: 'login',
//         resource_type: 'user',
//         resource_id: user.id,
//       });

//       return {
//         user: {
//           id: user.id,
//           email: user.email,
//           full_name: userProfile?.full_name || null,
//         },
//         session: {
//           access_token: session.access_token,
//           expires_in: session.expires_in,
//           token_type: session.token_type,
//         },
//       };
//     } catch (error) {
//       _error('Login error:', error);
//       throw error;
//     }
//   }

//   /**
//    * Logout user
//    */
//   async logout(userId) {
//     try {
//       await getSupabaseClient().auth.signOut();

//       // Log logout action
//       await this._logAudit({
//         user_id: userId,
//         action: 'logout',
//         resource_type: 'user',
//         resource_id: userId,
//       });

//       return { message: 'Logout successful' };
//     } catch (error) {
//       _error('Logout error:', error);
//       throw error;
//     }
//   }

//   /**
//    * Request password reset email
//    */
//   async forgotPassword(email) {
//     const supabase = getSupabaseClient();

//     try {
//       const { error } = await supabase.auth.resetPasswordForEmail(email, {
//         redirectTo: `${process.env.FRONTEND_URL}/reset-password`,
//       });

//       if (error) {
//         _error('Forgot password error:', error);
//         throw new Error(error.message || 'Failed to send password reset email');
//       }

//       // Security: always return same message
//       return { message: 'If an account exists with this email, a password reset link will be sent' };
//     } catch (error) {
//       _error('Forgot password service error:', error);
//       throw error;
//     }
//   }

  /**
   * Reset password with token from email
   */
//   async resetPassword({ email, token, password }) {
//     const supabase = getSupabaseClient();

//     try {
//       // Verify token and exchange for session
//       const { data, error } = await supabase.auth.verifyOtp({
//         email,
//         token,
//         type: 'recovery',
//       });

//       if (error) {
//         warn('Password reset token verification failed:', error.message);
//         throw new Error('Invalid or expired reset token');
//       }

//       // Update password
//       const { error: updateError } = await supabase.auth.updateUser({
//         password,
//       });

//       if (updateError) {
//         _error('Password update error:', updateError);
//         throw new Error(updateError.message || 'Failed to update password');
//       }

//       return { message: 'Password reset successful. Please log in with your new password.' };
//     } catch (error) {
//       _error('Reset password error:', error);
//       throw error;
//     }
//   }

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
          expires_in: session.expires_in,
          token_type: session.token_type,
        },
      };
    } catch (error) {
      _error('Login error:', error);
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

  async forgotPassword(email) {
    const supabase = getSupabaseClient();

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${process.env.FRONTEND_URL}/reset-password`,
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
    const supabase = getSupabaseClient();

    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'recovery',
      });

      if (error) {
        warn('Password reset token verification failed:', error.message);
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
    } catch (error) {
      _error('Reset password error:', error);
      throw error;
    }
  }

  /**
   * Get current user from access token
   */
  async getCurrentUser(accessToken) {
    const supabase = getSupabaseClient();

    try {
      const { data, error } = await supabase.auth.getUser(accessToken);

      if (error) {
        throw new Error('Invalid or expired token');
      }

      const authUser = data.user;

      // Get user profile
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

  /**
   * Helper: Log audit trail
   */
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
