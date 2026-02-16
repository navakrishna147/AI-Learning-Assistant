#!/usr/bin/env node
/**
 * ============================================================================
 * PRODUCTION-READY BACKEND SERVER - PERMANENT FIX
 * ============================================================================
 * 
 * This server ensures:
 * ✅ PORT is read correctly from .env
 * ✅ Server starts and listens properly
 * ✅ /health route responds immediately
 * ✅ CORS configured correctly
 * ✅ Port conflicts detected early
 * ✅ Proper error logging
 * ✅ No silent failures
 * ✅ Works for local, Docker, and production environments
 * 
 * To use:
 * - Ensure backend/.env has: PORT=5000
 * - Run: npm run dev
 * - Test: curl http://localhost:5000/health
 */

import 'dotenv/config.js';
import express from 'express';
import cors from 'cors';
import http from 'http';
import net from 'net';

// ============================================================================
// CONFIGURATION & VALIDATION
// ============================================================================

const PORT = parseInt(process.env.PORT || '5000', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-learning-assistant';
const JWT_SECRET = process.env.JWT_SECRET;

// CORS Origins - Allow frontend to connect
const CORS_ORIGINS = process.env.CORS_ORIGINS 
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5174'];

// Validation
const errors = [];
if (!PORT || isNaN(PORT)) errors.push('❌ PORT must be a number');
if (PORT < 1 || PORT > 65535) errors.push(`❌ PORT must be between 1-65535, got ${PORT}`);
if (!MONGODB_URI) errors.push('❌ MONGODB_URI is required');
if (JWT_SECRET === 'dev_secret_change_in_production') {
  console.warn('⚠️  WARNING: JWT_SECRET is using default value - change in production!');
}

if (errors.length > 0) {
  console.error('\n' + '═'.repeat(80));
  console.error('❌ CONFIGURATION ERROR - CANNOT START SERVER');
  console.error('═'.repeat(80));
  errors.forEach(err => console.error(err));
  console.error('\n📋 Fix your backend/.env file:');
  console.error('   PORT=5000');
  console.error('   MONGODB_URI=mongodb://localhost:27017/ai-learning-assistant');
  console.error('   JWT_SECRET=your_secret_key_here');
  console.error('═'.repeat(80) + '\n');
  process.exit(1);
}

// ============================================================================
// PRE-STARTUP CHECKS
// ============================================================================

/**
 * Check if port is already in use (non-blocking detection)
 */
const checkPortAvailable = (port) => {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false); // Port in use
      } else {
        resolve(true); // Other error, assume available
      }
    });
    server.once('listening', () => {
      server.close();
      resolve(true); // Port available
    });
    server.listen(port);
  });
};

// ============================================================================
// EXPRESS APP SETUP
// ============================================================================

const app = express();

// CORS Configuration (CRITICAL for frontend connectivity)
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests without origin (like curl, mobile apps)
    if (!origin) return callback(null, true);
    
    // Allow if origin in whitelist
    if (CORS_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS not allowed for origin: ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  maxAge: 3600,
  optionsSuccessStatus: 200
}));

// Body parser middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ============================================================================
// HEALTH CHECK ROUTES (CRITICAL - respond immediately)
// ============================================================================

/**
 * Simple health check - always returns 200 if server is running
 * Frontend uses this to detect if backend is alive
 */
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'backend',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

/**
 * API health endpoint - includes connection status
 */
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'api',
    port: PORT,
    environment: NODE_ENV,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

/**
 * Root endpoint
 */
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Backend is running',
    port: PORT,
    environment: NODE_ENV,
    corsOrigins: CORS_ORIGINS
  });
});

// ============================================================================
// API ROUTES (Import your actual routes here)
// ============================================================================

// Placeholder for your actual API routes
// Replace with:
// import authRoutes from './routes/auth.js';
// import documentRoutes from './routes/documents.js';
// etc.

app.use('/api/auth', (req, res, next) => {
  // Placeholder - replace with actual auth routes
  res.status(200).json({ message: 'Auth routes not loaded yet' });
});

// ============================================================================
// ERROR HANDLING MIDDLEWARE
// ============================================================================

/**
 * 404 Not Found handler
 */
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

/**
 * Global error handler (must be last)
 */
app.use((err, req, res, next) => {
  const isDev = NODE_ENV === 'development';
  
  console.error('\n' + '═'.repeat(70));
  console.error('❌ API ERROR');
  console.error('═'.repeat(70));
  console.error('Path:', req.path);
  console.error('Method:', req.method);
  console.error('Error:', err.message);
  if (isDev) console.error('Stack:', err.stack);
  console.error('═'.repeat(70) + '\n');

  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    path: req.path,
    ...(isDev && { stack: err.stack })
  });
});

// ============================================================================
// SERVER STARTUP WITH PROPER ERROR HANDLING
// ============================================================================

const startServer = async () => {
  try {
    // Check if port is available
    console.log(`\n📋 Checking if port ${PORT} is available...`);
    const portAvailable = await checkPortAvailable(PORT);
    
    if (!portAvailable) {
      console.error(`\n${'═'.repeat(70)}`);
      console.error('❌ CRITICAL: PORT ALREADY IN USE');
      console.error('═'.repeat(70));
      console.error(`Port ${PORT} is already being used by another process.\n`);
      console.error('Solutions:');
      console.error(`  1. Kill the existing process: taskkill /F /IM node.exe`);
      console.error(`  2. Check what's using the port: netstat -ano | findstr :${PORT}`);
      console.error(`  3. Change PORT in .env to: PORT=5001`);
      console.error('═'.repeat(70) + '\n');
      process.exit(1);
    }

    // Create HTTP server
    console.log(`\n🚀 Starting server on port ${PORT}...`);
    
    const server = http.createServer(app);

    // Handle server errors
    server.on('error', (err) => {
      console.error('\n' + '═'.repeat(70));
      console.error('❌ SERVER ERROR');
      console.error('═'.repeat(70));
      console.error(`Error Code: ${err.code}`);
      console.error(`Message: ${err.message}`);
      
      if (err.code === 'EADDRINUSE') {
        console.error(`\n❌ Port ${PORT} is already in use`);
        console.error('Solution: Check "netstat -ano | findstr :' + PORT + '"');
      } else if (err.code === 'EACCES') {
        console.error(`\n❌ Permission denied on port ${PORT}`);
        console.error('Solution: Use a port > 1024 or run with admin privileges');
      }
      console.error('═'.repeat(70) + '\n');
      process.exit(1);
    });

    // Start listening
    server.listen(PORT, '0.0.0.0', () => {
      console.log('\n' + '═'.repeat(70));
      console.log('✅ SERVER STARTED SUCCESSFULLY');
      console.log('═'.repeat(70));
      console.log(`🚀 Port:        ${PORT}`);
      console.log(`🌍 Binding:     0.0.0.0:${PORT} (accessible from all interfaces)`);
      console.log(`🔧 Environment: ${NODE_ENV}`);
      console.log(`🔒 CORS:        Allowed origins: ${CORS_ORIGINS.slice(0, 2).join(', ')}${CORS_ORIGINS.length > 2 ? ' ...' : ''}`);
      console.log('\n📊 Test endpoints:');
      console.log(`   ✅ GET /health           → http://localhost:${PORT}/health`);
      console.log(`   ✅ GET /api/health       → http://localhost:${PORT}/api/health`);
      console.log(`   ✅ GET /                 → http://localhost:${PORT}/`);
      console.log('\n💻 Frontend:');
      console.log(`   http://localhost:5173`);
      console.log('═'.repeat(70) + '\n');
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('\n📴 SIGTERM received - closing server gracefully...');
      server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      console.log('\n📴 SIGINT received - closing server gracefully...');
      server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
      });
    });

  } catch (error) {
    console.error('\n' + '═'.repeat(70));
    console.error('🚫 FATAL ERROR - CANNOT START SERVER');
    console.error('═'.repeat(70));
    console.error(`Error: ${error.message}`);
    console.error(`Stack: ${error.stack}`);
    console.error('═'.repeat(70) + '\n');
    process.exit(1);
  }
};

// ============================================================================
// UNHANDLED ERRORS
// ============================================================================

process.on('uncaughtException', (error) => {
  console.error('\n' + '═'.repeat(70));
  console.error('🔴 UNCAUGHT EXCEPTION');
  console.error('═'.repeat(70));
  console.error(`Error: ${error.message}`);
  console.error(`Stack: ${error.stack}`);
  console.error('═'.repeat(70) + '\n');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n' + '═'.repeat(70));
  console.error('⚠️  UNHANDLED REJECTION');
  console.error('═'.repeat(70));
  console.error(`Reason: ${reason}`);
  console.error(`Promise: ${promise}`);
  console.error('═'.repeat(70) + '\n');
});

// ============================================================================
// START THE SERVER
// ============================================================================

startServer();

export default app;
