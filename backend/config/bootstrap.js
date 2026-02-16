/**
 * ============================================================================
 * APPLICATION BOOTSTRAP SEQUENCE
 * ============================================================================
 * 
 * Handles all startup operations in correct order:
 * 1. Environment validation
 * 2. Database connection with blocking
 * 3. Service initialization
 * 4. Express app setup
 * 5. HTTP server startup
 * 
 * This module orchestrates the entire startup process and ensures
 * proper dependency ordering.
 */

import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

import {
  config,
  isDevelopment,
  isProduction,
  getCORSOrigins,
  validateEnvironment
} from './env.js';

import connectDB from './db.js';
import { setupMiddleware } from './middleware.js';
import { setupRoutes } from './routes.js';
import { setupErrorHandling } from './errorHandling.js';
import { checkHealthStatus } from '../services/healthService.js';
import { initializeEmailService } from '../services/emailConfigValidator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_ROOT = path.dirname(__dirname);

// ============================================================================
// STARTUP PHASES
// ============================================================================

/**
 * Phase 1: Initialize filesystem (uploads directory)
 */
const initializeFilesystem = () => {
  const uploadsDir = path.join(BACKEND_ROOT, 'uploads');
  
  try {
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
      console.log('✅ Uploads directory created');
    }
  } catch (error) {
    if (isProduction) {
      throw new Error(`Cannot create uploads directory: ${error.message}`);
    }
    console.warn(`⚠️  Cannot create uploads directory: ${error.message}`);
  }
};

/**
 * Phase 2: Initialize Express app with middleware
 */
const initializeExpress = (uploadsDir) => {
  const app = express();

  // Setup CORS first (before other middleware)
  const corsOrigins = getCORSOrigins();
  app.use(cors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH', 'HEAD'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token'],
    exposedHeaders: ['X-Total-Count', 'Content-Length'],
    maxAge: 3600,
    optionsSuccessStatus: 200
  }));

  // Setup application middleware
  setupMiddleware(app, uploadsDir);

  return app;
};

/**
 * Phase 3: Connect to database with blocking
 * CRITICAL: connectDB() retries 5 times then THROWS — never returns null.
 * We do NOT catch here. If the DB is unreachable the bootstrap must fail.
 */
const connectToDatabase = async () => {
  console.log('\n🔌 Initializing MongoDB connection...');
  const db = await connectDB();   // throws on failure — never null
  return db;
};

/**
 * Phase 4: Register routes
 */
const registerRoutes = (app) => {
  setupRoutes(app);
  console.log('✅ Routes registered');
};

/**
 * Phase 5: Setup error handling (must be last)
 */
const registerErrorHandling = (app) => {
  setupErrorHandling(app);
  console.log('✅ Error handling configured');
};

/**
 * Phase 6: Start HTTP server with production-grade configuration
 * 
 * CRITICAL: Server only starts after database connection is ready
 * Binds to 127.0.0.1 (IPv4 loopback) — matches Vite proxy target exactly
 */
const startHttpServer = (app) => {
  return new Promise((resolve, reject) => {
    const PORT = config.PORT;

    // On Render / Heroku / Railway the host MUST be 0.0.0.0 so the
    // platform reverse-proxy can reach the container.
    // Locally we keep 127.0.0.1 for Vite proxy compatibility.
    const BIND_HOST = process.env.RENDER || isProduction ? '0.0.0.0' : '127.0.0.1';

    const server = app.listen(PORT, BIND_HOST, () => {
      const dbStatus = mongoose.connection.readyState === 1 
        ? '✅ Connected' 
        : '⚠️  Disconnected (will auto-reconnect)';

      console.log(`\n${'═'.repeat(70)}`);
      console.log('✅ APPLICATION STARTED SUCCESSFULLY');
      console.log('═'.repeat(70));
      console.log(`🚀 Server Port: ${PORT}`);
      console.log(`🌍 Binding: ${BIND_HOST}:${PORT}${BIND_HOST === '0.0.0.0' ? ' (all interfaces — cloud)' : ' (IPv4 loopback — local)'}`);
      console.log(`🔧 Environment: ${config.NODE_ENV}`);
      console.log(`💾 Database: ${dbStatus}`);
      console.log(`🤖 AI Service: ${config.GROQ_API_KEY ? '✅ Configured' : '⚠️  Not configured'}`);
      console.log(`🔒 CORS Origins: ${getCORSOrigins().slice(0, 2).join(', ')}${getCORSOrigins().length > 2 ? '...' : ''}`);
      console.log(`\n📊 Health Check Endpoints:`);
      console.log(`   GET /health              → Server alive check`);
      console.log(`   GET /api/health          → Quick health (with DB status)`);
      console.log(`   GET /api/health/detailed → Full diagnostics`);
      console.log('═'.repeat(70) + '\n');

      resolve(server);
    });

    // Handle server startup errors
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(
          `❌ CRITICAL: Port ${PORT} is already in use!\n` +
          `   Solution 1: Kill the existing process on port ${PORT}\n` +
          `   Solution 2: Change PORT in .env file\n` +
          `   Solution 3: Use PM2 to manage process restarts`
        ));
      } else if (err.code === 'EACCES') {
        reject(new Error(
          `❌ CRITICAL: Permission denied to bind to port ${PORT}\n` +
          `   Solution: Use port > 1024 or run with elevated privileges`
        ));
      } else {
        reject(err);
      }
    });

    // Enable TCP keep-alive for long-lived connections
    server.keepAliveTimeout = 65000; // 65 seconds (higher than client timeout)
  });
};

// ============================================================================
// MAIN BOOTSTRAP ORCHESTRATION
// ============================================================================

export const bootstrap = async () => {
  try {
    console.log('\n' + '═'.repeat(70));
    console.log('🚀 STARTING APPLICATION BOOTSTRAP SEQUENCE');
    console.log('═'.repeat(70) + '\n');

    // Phase 1: Filesystem
    console.log('Phase 1: Initializing filesystem...');
    const uploadsDir = path.join(BACKEND_ROOT, 'uploads');
    initializeFilesystem();

    // Phase 2: Environment validation
    console.log('Phase 2: Validating environment variables...');
    validateEnvironment();
    console.log('✅ Environment validated');

    // Phase 3: Database
    console.log('Phase 3: Connecting to database...');
    const db = await connectToDatabase();
    console.log('✅ Database connected');

    // Phase 3b: Email service (non-critical — never blocks startup)
    try {
      const emailConfigured = await initializeEmailService();
      if (!emailConfigured) {
        console.log('   ℹ️  Email feature disabled (configure EMAIL_USER/EMAIL_PASSWORD in .env)');
      }
    } catch (emailErr) {
      console.warn(`   ⚠️  Email service skipped: ${emailErr.message}`);
      // Email is optional in ALL environments — never block the server
    }

    // Phase 4: Express app
    console.log('Phase 4: Initializing Express application...');
    const app = initializeExpress(uploadsDir);
    console.log('✅ Express initialized with middleware');

    // Phase 5: Routes
    console.log('Phase 5: Registering routes...');
    registerRoutes(app);

    // Phase 6: Error handling
    console.log('Phase 6: Setting up error handling...');
    registerErrorHandling(app);

    // Phase 7: Start server
    console.log('Phase 7: Starting HTTP server...');
    const server = await startHttpServer(app);

    // Setup graceful shutdown
    setupGracefulShutdown(server);

    return { app, server, db };

  } catch (error) {
    console.error('\n' + '═'.repeat(70));
    console.error('❌ BOOTSTRAP FAILED');
    console.error('═'.repeat(70));
    console.error(`Error: ${error.message}`);
    if (isDevelopment) {
      console.error(`\nStack: ${error.stack}`);
    }
    console.error('═'.repeat(70) + '\n');

    // Disconnect mongoose if it was already connected before a later phase failed
    if (mongoose.connection.readyState === 1) {
      try { await mongoose.disconnect(); } catch { /* best-effort */ }
    }

    process.exit(1);
  }
};

/**
 * Setup graceful shutdown handlers
 */
const setupGracefulShutdown = (server) => {
  const shutdown = async (signal) => {
    console.log(`\n📴 ${signal} received. Starting graceful shutdown...`);

    // Close HTTP server
    server.close(async () => {
      console.log('✅ HTTP server closed');

      // Disconnect database
      try {
        await mongoose.disconnect();
        console.log('✅ Database disconnected');
      } catch (e) {
        console.error('⚠️  Error disconnecting database:', e.message);
      }

      console.log('✅ Shutdown complete');
      process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      console.error('❌ Graceful shutdown timeout. Forcing exit.');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Note: unhandledRejection and uncaughtException are handled in server.js
  // Do NOT re-register them here to avoid conflicting exit behaviour.
};

export default bootstrap;
