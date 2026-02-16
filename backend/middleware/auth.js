import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// @desc    Protect routes - verify JWT token
// @access  Private
export const protect = async (req, res, next) => {
  try {
    // Check for authorization header
    if (!req.headers.authorization) {
      return res.status(401).json({ 
        success: false,
        message: 'No authorization token provided' 
      });
    }

    // Check if header starts with Bearer
    if (!req.headers.authorization.startsWith('Bearer')) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid token format' 
      });
    }

    // Extract token
    const token = req.headers.authorization.split(' ')[1];

    if (!token) {
      return res.status(401).json({ 
        success: false,
        message: 'Token is missing' 
      });
    }

    // Verify token — NO fallback secret; env.js validates JWT_SECRET at startup
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error('CRITICAL: JWT_SECRET is not set');
      return res.status(500).json({ success: false, message: 'Server configuration error' });
    }
    const decoded = jwt.verify(token, secret);

    // Find user
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(403).json({ 
        success: false,
        message: 'User account is inactive' 
      });
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    console.error('❌ Auth middleware error:', error.message);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false,
        message: 'Token has expired' 
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid token' 
      });
    }

    res.status(401).json({ 
      success: false,
      message: error.message || 'Authentication failed' 
    });
  }
};

// @desc    Optional protection - doesn't fail if no token
// @access  Public
export const optionalAuth = async (req, res, next) => {
  try {
    if (!req.headers.authorization?.startsWith('Bearer')) {
      return next();
    }

    const token = req.headers.authorization.split(' ')[1];
    if (!token) {
      return next();
    }

    const secret = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
    const decoded = jwt.verify(token, secret);
    const user = await User.findById(decoded.id);

    if (user) {
      req.user = user;
    }
    next();
  } catch (error) {
    // Silently fail - user remains unauthenticated
    next();
  }
};
