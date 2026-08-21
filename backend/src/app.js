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
import examRoutes from './modules/exams/exam.routes.js'
import questionRoutes from './modules/questions/question.routes.js'
import responseRoutes from './modules/responses/response.routes.js'
import speechRoutes from './modules/speech/speech.routes.js'
import feedbackRoutes from './modules/feedback/feedback.routes.js'
import historyRoutes from './modules/history/history.routes.js'
import cvRoutes from './modules/cv/cv.routes.js'

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
// Loopback and private-LAN origins are allowed in development so a new DHCP
// lease on the dev machine does not require editing an IP allowlist here.
// Native mobile requests send no Origin header and are unaffected either way.
const LOCAL_ORIGIN_PATTERN =
  /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/;

const allowedOrigins = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim());
const isProduction = process.env.NODE_ENV === 'production';

app.use(cors({
  origin: (origin, callback) => {
    // No Origin header: native mobile clients, curl, same-origin requests.
    if (!origin) return callback(null, true);

    if (allowedOrigins?.includes(origin)) return callback(null, true);
    if (!isProduction && LOCAL_ORIGIN_PATTERN.test(origin)) return callback(null, true);

    return callback(new Error(`Origin not allowed by CORS: ${origin}`));
  },
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


app.use('/api/v1/auth', authRoutes)
app.use('/api/v1/users', userRoutes)
app.use('/api/v1/job-descriptions', jobDescriptionRoutes)
app.use('/api/v1/interviews', interviewSessionsRoutes)
app.use('/api/v1/exams', examRoutes)
app.use('/api/v1/questions', questionRoutes)
app.use('/api/v1/responses', responseRoutes)
app.use('/api/v1/speech', speechRoutes)
app.use('/api/v1/feedback', feedbackRoutes)
app.use('/api/v1/history', historyRoutes)
app.use('/api/v1/cv', cvRoutes)


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


export default app;
