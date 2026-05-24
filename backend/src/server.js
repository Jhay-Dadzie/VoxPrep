/**
 * Server Startup File
 * Entry point for the application
 * Run with: node src/server.js OR npm start
 */

import 'dotenv/config';
import app from './app.js';
import { info, error } from './core/errors/logger.js';

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * Start the server
 */
const server = app.listen(PORT, () => {
  info(`
╔════════════════════════════════════════════════════════════╗
║   Interview Preparation Backend Server                     ║
║   Powered by Supabase Auth                                 ║
╚════════════════════════════════════════════════════════════╝
  
  Environment: ${NODE_ENV}
  Server URL: http://localhost:${PORT}
  API Documentation: http://localhost:${PORT}/api/v1/docs
  Health Check: http://localhost:${PORT}/health
  
  Authentication Routes:
    POST   /api/v1/auth/signup
    POST   /api/v1/auth/login
    POST   /api/v1/auth/logout
    POST   /api/v1/auth/refresh
    GET    /api/v1/auth/me
    POST   /api/v1/auth/forgot-password
    POST   /api/v1/auth/reset-password
    POST   /api/v1/auth/verify-email
    POST   /api/v1/auth/resend-verification
    POST   /api/v1/auth/update-password
  
  Press CTRL + C to stop the server
  `);
});

/**
 * Handle graceful shutdown
 */
const gracefulShutdown = () => {
  info('Shutting down gracefully...');

  server.close(() => {
    info('HTTP server closed');
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    error('Forced shutdown due to timeout');
    process.exit(1);
  }, 10000);
};

// Handle termination signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

/**
 * Handle uncaught exceptions
 */
process.on('uncaughtException', (err) => {
  error('Uncaught Exception:', err);
  gracefulShutdown();
});

/**
 * Handle unhandled promise rejections
 */
process.on('unhandledRejection', (reason, promise) => {
  error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown();
});

/**
 * Export server for testing
 */
export default server;
