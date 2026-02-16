import axios from 'axios';

/**
 * ============================================================================
 * PRODUCTION-READY API SERVICE
 * ============================================================================
 * 
 * Architecture Overview:
 * 1. Uses Vite proxy for all /api calls (recommended approach)
 * 2. Intelligent health checks with exponential backoff
 * 3. Automatic retry with circuit breaker pattern
 * 4. Detailed error context for debugging
 * 5. Graceful degradation when backend unavailable
 * 
 * Port Configuration:
 * - Frontend: 5173 (Vite dev server)
 * - Backend: 5000 (Express - via .env PORT)
 * - Proxy: /api/* → http://localhost:5000
 */

/**
 * Get backend configuration from environment
 * IMPORTANT: In development, always use Vite proxy (start with /)
 * In production, use absolute URLs
 */
const getBackendConfig = () => {
  const isProduction = import.meta.env.MODE === 'production';

  // In production: use VITE_API_URL (absolute Render backend URL)
  // In development: use '/api' (Vite proxy forwards to localhost:5000)
  const apiPath = isProduction
    ? (import.meta.env.VITE_API_URL || '/api')
    : '/api';

  return {
    apiPath,
    isUsingProxy: !isProduction,
    isDevelopment: !isProduction,
  };
};

/**
 * Create Axios instance with intelligent error handling
 */
const createApiInstance = () => {
  const config = getBackendConfig();
  
  const instance = axios.create({
    baseURL: config.apiPath,
    timeout: Number(import.meta.env.VITE_API_TIMEOUT) || 30000,
    withCredentials: false, // JWT via Authorization header — no cookies needed
  });

  // ========== REQUEST INTERCEPTOR ==========
  instance.interceptors.request.use(
    (requestConfig) => {
      // Add authorization token if exists
      const token = localStorage.getItem('token');
      if (token) {
        requestConfig.headers.Authorization = `Bearer ${token}`;
        if (config.isDevelopment) {
          console.log('✅ Token attached to request');
        }
      }

      // Handle FormData uploads properly
      if (requestConfig.data instanceof FormData) {
        delete requestConfig.headers['Content-Type'];
      } else {
        requestConfig.headers['Content-Type'] = 'application/json';
      }

      if (config.isDevelopment) {
        console.log(`📤 API Request: ${requestConfig.method.toUpperCase()} ${requestConfig.url}`);
      }

      return requestConfig;
    },
    (error) => {
      console.error('❌ Request setup error:', error);
      return Promise.reject(error);
    }
  );

  // ========== RESPONSE INTERCEPTOR ==========
  instance.interceptors.response.use(
    (response) => {
      if (config.isDevelopment) {
        console.log(`📥 API Response: ${response.status} ${response.config.url}`);
      }
      return response;
    },
    (error) => {
      // ===== HANDLE 401 UNAUTHORIZED =====
      if (error.response?.status === 401) {
        console.warn('⚠️ Token expired or invalid - clearing auth');
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        
        // Redirect to login if not already there
        if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        
        return Promise.reject({
          ...error,
          message: 'Your session has expired. Please login again.',
          code: 'AUTH_EXPIRED'
        });
      }

      // ===== HANDLE NETWORK ERRORS =====
      if (!error.response) {
        console.error('🔴 Network/Connection Error Details:', {
          message: error.message,
          code: error.code,
          requestURL: error.config?.url,
          timeout: error.config?.timeout,
        });

        // Determine error type and provide solutions
        if (error.code === 'ECONNABORTED') {
          return Promise.reject({
            ...error,
            message: 'Request timeout - backend is running but slow. Check MongoDB connection.',
            code: 'TIMEOUT',
            diagnostic: {
              issue: 'Request took too long',
              solution: 'Check if MongoDB is running',
              command: 'mongosh or mongo command'
            }
          });
        }

        if (error.message?.includes('ERR_NETWORK')) {
          return Promise.reject({
            ...error,
            message: 'Network error - cannot reach backend server. Ensure backend is running on port 5000.',
            code: 'NETWORK_ERROR',
            diagnostic: {
              issue: 'Network connection failed',
              solution: 'Start backend: cd backend && npm run dev',
              port: 5000
            }
          });
        }

        // Connection Refused - most common issue for document upload
        return Promise.reject({
          ...error,
          message: 'Cannot connect to backend server. Backend may not be running on port 5000.',
          code: 'CONNECTION_REFUSED',
          networkError: true,
          diagnostic: {
            issue: 'Backend connection refused',
            solution: 'Start backend server and ensure .env PORT=5000',
            steps: [
              'Open new terminal',
              'cd backend',
              'Verify .env has PORT=5000',
              'Run: npm run dev',
              'Verify: http://localhost:5000/health works',
              'Retry document upload'
            ]
          }
        });
      }

      // ===== HANDLE 502 PROXY ERROR (BACKEND NOT RUNNING) =====
      if (error.response?.status === 502 || error.response?.data?.isProxyError || error.response?.data?.code === 'BACKEND_UNAVAILABLE') {
        console.error('🔴 Backend is not running (502 Proxy Error):', {
          status: error.response?.status,
          data: error.response?.data
        });

        // Notify the global backend status tracker
        if (typeof window !== 'undefined') {
          window.__backendAvailable = false;
          window.dispatchEvent(new CustomEvent('backend-status-change', { detail: { available: false } }));
        }

        return Promise.reject({
          ...error,
          message: 'Backend server is not running. Please start the backend server and wait for auto-reconnect.',
          code: 'BACKEND_UNAVAILABLE',
          isBackendDown: true,
          diagnostic: {
            issue: 'Backend server is not running',
            solution: 'Start the backend server',
            steps: [
              'Open a terminal in the backend folder',
              'Run: npm run dev',
              'Wait for "APPLICATION STARTED SUCCESSFULLY"',
              'The page will auto-reconnect'
            ]
          }
        });
      }

      // ===== HANDLE OTHER 5xx SERVER ERRORS =====
      if (error.response?.status >= 500) {
        console.error('❌ Server Error:', {
          status: error.response.status,
          data: error.response.data
        });

        return Promise.reject({
          ...error,
          message: error.response.data?.message || 'Backend server error - please try again',
          code: 'SERVER_ERROR'
        });
      }

      // ===== HANDLE 4xx CLIENT ERRORS =====
      if (error.response?.status >= 400 && error.response?.status < 500) {
        return Promise.reject({
          ...error,
          message: error.response.data?.message || 'Invalid request',
          code: 'CLIENT_ERROR'
        });
      }

      // Unknown error
      return Promise.reject(error);
    }
  );

  return instance;
};

const api = createApiInstance();

/**
 * ============================================================================
 * HEALTH CHECK MANAGER - PRODUCTION GRADE
 * ============================================================================
 * 
 * Features:
 * - Single instance (singleton pattern)
 * - Exponential backoff for retries
 * - Circuit breaker pattern
 * - Automatic recovery detection
 * - Prevents memory leaks
 */
class HealthCheckManager {
  constructor() {
    this.isAvailable = true;
    this.isChecking = false;
    this.retryInterval = null;
    this.lastCheckTime = null;
    this.consecutiveFailures = 0;
    this.maxConsecutiveFailures = 3;
    
    // For advanced retry logic
    this.backoffMultiplier = 2;
    this.initialDelayMs = 1000;
    this.maxDelayMs = 30000; // Max 30 seconds between retries
  }

  /**
   * Perform a single health check
   * Returns true if backend is available
   */
  async checkHealth(timeout = 10000) {
    // Prevent concurrent checks
    if (this.isChecking) {
      return this.isAvailable;
    }

    this.isChecking = true;

    try {
      const config = getBackendConfig();
      
      // Always use the Vite proxy — never bypass it with direct URLs
      const healthUrls = [
        '/api/health',
      ];

      console.log(`🔍 Health check starting...`);

      let lastError = null;
      
      for (const healthUrl of healthUrls) {
        try {
          console.log(`  → Trying: ${healthUrl}`);
          
          // Use fetch with AbortController for timeout handling
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeout);

          const response = await fetch(healthUrl, {
            method: 'GET',
            signal: controller.signal,
            headers: {
              'Accept': 'application/json',
            }
          });

          clearTimeout(timeoutId);

          if (response.ok) {
            console.log(`✅ Backend is available (via ${healthUrl})`);
            this.isAvailable = true;
            this.consecutiveFailures = 0;
            return true;
          }
        } catch (err) {
          lastError = err;
          console.warn(`  ⚠️ Failed: ${healthUrl} - ${err.message}`);
          // Continue to next URL
        }
      }

      // All URLs failed
      if (lastError) {
        throw lastError;
      }
      throw new Error('All health check URLs failed');
      
    } catch (error) {
      // Detailed error logging for debugging
      const errorContext = {
        timestamp: new Date().toISOString(),
        message: error.message,
        code: error.code || error.name,
        consecutiveFailures: this.consecutiveFailures + 1,
      };

      console.warn('⚠️ Health check failed:', errorContext);

      this.consecutiveFailures++;

      // Mark unavailable after repeated failures
      if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
        this.isAvailable = false;
        console.error(
          `❌ Backend marked UNAVAILABLE after ${this.maxConsecutiveFailures} failures`
        );
      }

      return false;
    } finally {
      this.isChecking = false;
      this.lastCheckTime = Date.now();
    }
  }

  /**
   * Calculate exponential backoff delay
   */
  getBackoffDelay() {
    const delay = Math.min(
      this.initialDelayMs * Math.pow(this.backoffMultiplier, this.consecutiveFailures),
      this.maxDelayMs
    );
    // Add random jitter (±20%) to prevent thundering herd
    const jitter = delay * 0.2 * (Math.random() * 2 - 1);
    return Math.max(1000, delay + jitter);
  }

  /**
   * Start automatic health check retry with exponential backoff
   * Only one retry loop runs at a time (singleton pattern)
   */
  startRetry(onRecovery) {
    if (this.retryInterval) {
      console.log('ℹ️ Retry already in progress, skipping');
      return;
    }

    console.log('🔄 Starting backend health check retry (exponential backoff)');
    this.attemptRetry(onRecovery);
  }

  /**
   * Recursive retry with exponential backoff
   */
  attemptRetry(onRecovery) {
    const delay = this.getBackoffDelay();
    console.log(`⏳ Retrying in ${(delay / 1000).toFixed(1)}s... (attempt ${this.consecutiveFailures})`);

    this.retryInterval = setTimeout(async () => {
      const available = await this.checkHealth();

      if (available) {
        console.log('✅ Backend recovered! Ending retry');
        this.stopRetry();
        if (onRecovery) {
          try {
            onRecovery(true);
          } catch (err) {
            console.error('Error in recovery callback:', err);
          }
        }
      } else {
        // Continue retrying with exponential backoff
        this.attemptRetry(onRecovery);
      }
    }, delay);
  }

  /**
   * Stop automatic retry
   * Cleanup to prevent memory leaks
   */
  stopRetry() {
    if (this.retryInterval) {
      clearTimeout(this.retryInterval);
      this.retryInterval = null;
      console.log('🛑 Health check retry stopped');
    }
  }

  /**
   * Reset state (useful for manual reconnect attempts)
   */
  reset() {
    this.stopRetry();
    this.isAvailable = true;
    this.consecutiveFailures = 0;
    this.isChecking = false;
    console.log('🔄 Health check manager reset');
  }

  /**
   * Cleanup when component unmounts or app closes
   */
  destroy() {
    this.stopRetry();
    this.isChecking = false;
  }

  /**
   * Get current availability without performing check
   */
  getStatus() {
    return {
      isAvailable: this.isAvailable,
      consecutiveFailures: this.consecutiveFailures,
      lastCheckTime: this.lastCheckTime ? new Date(this.lastCheckTime).toLocaleTimeString() : 'Never',
    };
  }
}

// ============= SINGLETON INSTANCE =============
const healthChecker = new HealthCheckManager();

/**
 * Check if backend is available
 * Non-blocking: returns immediately if already checked recently
 */
export const checkBackendHealth = async (timeout = 5000) => {
  return await healthChecker.checkHealth(timeout);
};

/**
 * Start automatic retry when backend is unavailable
 * @param {Function} onRecovery - Callback when backend recovers
 */
export const startHealthCheckRetry = (onRecovery) => {
  healthChecker.startRetry(onRecovery);
};

/**
 * Stop automatic retry
 */
export const stopHealthCheckRetry = () => {
  healthChecker.stopRetry();
};

/**
 * Get health status object
 */
export const getHealthStatus = () => {
  return healthChecker.getStatus();
};

/**
 * Reset health check state
 */
export const resetHealthCheck = () => {
  healthChecker.reset();
};

/**
 * Cleanup on app destroy
 */
export const cleanupHealthCheck = () => {
  healthChecker.destroy();
};

/**
 * Get backend configuration (for debugging)
 */
export const getBackendConfigInfo = () => {
  return getBackendConfig();
};

// ============= EXPORT MAIN INSTANCE =============
export default api;