/**
 * ============================================================================
 * MIDDLEWARE ORCHESTRATION
 * ============================================================================
 * 
 * Centralizes all middleware setup in correct order:
 * 1. Security headers
 * 2. Body parsing
 * 3. Request logging
 * 4. Request tracking
 * 5. Static files
 */

import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';

export const setupMiddleware = (app, uploadsDir) => {
  // ========== SECURITY HEADERS ==========
  // Only in production
  if (process.env.NODE_ENV === 'production') {
    app.use(helmet({
      contentSecurityPolicy: false, // Disable CSP for frontend flexibility
      crossOriginResourcePolicy: { policy: 'cross-origin' }
    }));
  }

  // ========== RATE LIMITING ==========
  // Global: 200 requests per 15 min per IP
  app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests, please try again later' }
  }));

  // Auth-specific: 20 attempts per 15 min per IP (login, signup, forgot-password)
  app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { success: false, message: 'Too many login attempts, please try again later' } }));
  app.use('/api/auth/signup', rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { success: false, message: 'Too many signup attempts, please try again later' } }));
  app.use('/api/auth/forgot-password', rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: { success: false, message: 'Too many password reset attempts, please try again later' } }));

  // ========== BODY PARSING ==========
  // Must be before routes
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // ========== REQUEST LOGGING ==========
  if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
  } else {
    // Production: use combined format
    app.use(morgan('combined'));
  }

  // ========== CUSTOM REQUEST TRACKING ==========
  app.use((req, res, next) => {
    // Assign unique request ID
    req.id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Track response for logging
    const originalJson = res.json;
    res.json = function(data) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[${req.id}] ${req.method} ${req.path} -> ${res.statusCode}`);
      }
      return originalJson.call(this, data);
    };

    next();
  });

  // ========== STATIC FILES ==========
  // Serve uploaded files — require valid JWT
  app.use('/uploads', (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Authentication required to access files' });
    }
    try {
      const token = authHeader.split(' ')[1];
      jwt.verify(token, process.env.JWT_SECRET);
      next();
    } catch {
      return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
  }, express.static(uploadsDir, {
    etag: true,
    maxAge: 3600000 // 1 hour cache
  }));
};

export default setupMiddleware;
