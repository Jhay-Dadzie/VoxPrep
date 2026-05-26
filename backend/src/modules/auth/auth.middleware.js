/**
 * Simplified Authentication Middleware
 * JWT validation + rate limiting
 */

import { getSupabaseClient } from '../../config/supabase.js';
import { warn, error as _error } from '../../core/errors/logger.js';
import authRateLimit, { ipKeyGenerator } from 'express-rate-limit';

/**
 * Middleware to protect routes (requires valid JWT)
 */
const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No authentication token provided',
      });
    }

    const token = authHeader.slice(7);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token format',
      });
    }

    // Verify token with Supabase
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      warn('Token verification failed:', error?.message || 'Unknown error');
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
      });
    }

    // Attach user info to request
    req.user = {
      id: data.user.id,
      email: data.user.email,
    };

    req.authUser = data.user;
    req.token = token;

    next();
  } catch (error) {
    _error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication failed',
    });
  }
};

/**
 * Rate limiters for auth endpoints
 */

const signupLimiter = authRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100, // 100 attempts
  message: 'Too many signup attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip),
  skip: (req) => process.env.NODE_ENV === 'development',
});


const loginLimiter = authRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 attempts
  message: 'Too many login attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.body?.email || ipKeyGenerator(req.ip),
  skip: (req) => process.env.NODE_ENV === 'development',
});


const passwordLimiter = authRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 attempts
  message: 'Too many password reset attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.body?.email || ipKeyGenerator(req.ip),
  skip: (req) => process.env.NODE_ENV === 'development',
});

export default {
  protect,
  loginLimiter,
  signupLimiter,
  passwordLimiter,
};

export {
  protect,
  loginLimiter,
  signupLimiter,
  passwordLimiter,
};
