/**
 * Express Application Setup
 * Main app.js file showing complete auth integration
 */

import express, { json, urlencoded } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import 'dotenv/config'

import { request, warn, error } from './core/errors/logger.js';
import authRoutes from './modules/auth/auth.routes.js';
import userRoutes from './modules/users/user.routes.js'
import jobDescriptionRoutes from './modules/jobDescription/jobDescription.routes.js'
import interviewSessionsRoutes from './modules/interviews/interview.routes.js'
import questionRoutes from './modules/questions/question.routes.js'
import responseRoutes from './modules/responses/response.routes.js'

const app = express();
const PORT = process.env.PORT

/**
 * ============================================================================
 * SECURITY MIDDLEWARE
 * ============================================================================
 */

// Helmet - Set various HTTP headers for security
app.use(helmet());

// CORS - Enable cross-origin requests
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5050'],
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

/**
 * ============================================================================
 * BODY PARSING MIDDLEWARE
 * ============================================================================
 */

// Parse JSON bodies
app.use(json({ limit: '10mb' }));

// Parse URL-encoded bodies
app.use(urlencoded({ extended: true, limit: '10mb' }));

// Parse cookies
app.use(cookieParser());

/**
 * ============================================================================
 * LOGGING MIDDLEWARE
 * ============================================================================
 */

// Morgan HTTP request logger
app.use(morgan(':method :url :status :response-time ms'));

// Custom request logging
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    request(req.method, req.url, res.statusCode, duration);
  });

  next();
});

/**
 * ============================================================================
 * HEALTH CHECK ENDPOINT
 * ============================================================================
 */

app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is healthy',
    timestamp: new Date().toISOString(),
  });
});

/**
 * ============================================================================
 * AUTHENTICATION ROUTES WITH RATE LIMITING
 * ============================================================================
 */

// Register auth routes (routes include endpoint-specific rate limiting)
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes)
app.use('/api/v1/job-descriptions', jobDescriptionRoutes)
app.use('/api/v1/interviews', interviewSessionsRoutes)
app.use('/api/v1/questions', questionRoutes)
app.use('/api/v1/responses', responseRoutes)

/**
 * ============================================================================
 * EXAMPLE: OTHER MODULE ROUTES (PROTECTED)
 * ============================================================================
 */

// Example structure for other protected routes:
// These would be your job descriptions, interviews, etc.


/**
 * ============================================================================
 * API DOCUMENTATION ENDPOINT
 * ============================================================================
 */

// app.get('/api/v1/docs', (req, res) => {
//   res.json({
//     message: 'Interview Preparation API Documentation',
//     version: '1.0.0',
//     baseUrl: `http://localhost:${PORT|| 5000}`,
//     endpoints: {
//       auth: {
//         signup: {
//           method: 'POST',
//           path: '/api/v1/auth/signup',
//           body: { email: 'string', password: 'string', full_name: 'string?' },
//           public: true,
//         },
//         login: {
//           method: 'POST',
//           path: '/api/v1/auth/login',
//           body: { email: 'string', password: 'string' },
//           public: true,
//         },
//         logout: {
//           method: 'POST',
//           path: '/api/v1/auth/logout',
//           headers: { Authorization: 'Bearer token' },
//           public: false,
//         },
//         refresh: {
//           method: 'POST',
//           path: '/api/v1/auth/refresh',
//           body: { refresh_token: 'string' },
//           public: true,
//         },
//         getCurrentUser: {
//           method: 'GET',
//           path: '/api/v1/auth/me',
//           headers: { Authorization: 'Bearer token' },
//           public: false,
//         },
//         forgotPassword: {
//           method: 'POST',
//           path: '/api/v1/auth/forgot-password',
//           body: { email: 'string' },
//           public: true,
//         },
//         resetPassword: {
//           method: 'POST',
//           path: '/api/v1/auth/reset-password',
//           body: { email: 'string', token: 'string', password: 'string' },
//           public: true,
//         },
//         verifyEmail: {
//           method: 'POST',
//           path: '/api/v1/auth/verify-email',
//           body: { email: 'string', token: 'string' },
//           public: true,
//         },
//         updatePassword: {
//           method: 'POST',
//           path: '/api/v1/auth/update-password',
//           body: { current_password: 'string', new_password: 'string' },
//           headers: { Authorization: 'Bearer token' },
//           public: false,
//         },
//       },
//     },
//   });
// });

/**
 * ============================================================================
 * 404 HANDLER
 * ============================================================================
 */

app.use((req, res) => {
  warn(`Route not found: ${req.method} ${req.url}`);
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.url} not found`,
  });
});

/**
 * ============================================================================
 * ERROR HANDLING MIDDLEWARE
 * ============================================================================
 */

// Centralized error handling
app.use((err, req, res, next) => {
  error('Unhandled error:', err);

  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Internal server error';

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});


/**
 * ============================================================================
 * EXPORT APP
 * ============================================================================
 */

export default app;
