import { useState, useEffect, useRef, useCallback } from 'react';
import { checkBackendHealth } from '../services/api';

/**
 * ============================================================================
 * BACKEND STATUS BANNER
 * ============================================================================
 * 
 * Shows a persistent banner when the backend server is not running.
 * Features:
 * - Auto-detects backend unavailability via health checks
 * - Auto-retries with exponential backoff
 * - Auto-reloads page data when backend recovers
 * - Global event-based detection (works across all pages)
 * - Clean unmount (no memory leaks)
 */
const BackendStatusBanner = () => {
  const [backendDown, setBackendDown] = useState(false);
  const [checking, setChecking] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const retryTimerRef = useRef(null);
  const countdownTimerRef = useRef(null);
  const mountedRef = useRef(true);

  // Calculate retry delay with exponential backoff (max 15s)
  const getRetryDelay = useCallback((attempt) => {
    return Math.min(3000 * Math.pow(1.5, attempt), 15000);
  }, []);

  // Perform a health check
  const performHealthCheck = useCallback(async () => {
    if (!mountedRef.current) return false;
    setChecking(true);

    try {
      const available = await checkBackendHealth(5000);
      if (!mountedRef.current) return false;

      if (available) {
        setBackendDown(false);
        setRetryCount(0);
        setCountdown(0);
        window.__backendAvailable = true;
        window.dispatchEvent(new CustomEvent('backend-status-change', { detail: { available: true } }));
        // Trigger a soft reload of page data so user sees fresh content
        window.dispatchEvent(new CustomEvent('backend-recovered'));
        return true;
      } else {
        setBackendDown(true);
        window.__backendAvailable = false;
        return false;
      }
    } catch {
      if (!mountedRef.current) return false;
      setBackendDown(true);
      window.__backendAvailable = false;
      return false;
    } finally {
      if (mountedRef.current) setChecking(false);
    }
  }, []);

  // Schedule next retry with countdown
  const scheduleRetry = useCallback((attempt) => {
    if (!mountedRef.current) return;

    const delay = getRetryDelay(attempt);
    const seconds = Math.ceil(delay / 1000);
    setCountdown(seconds);

    // Countdown timer
    let remaining = seconds;
    countdownTimerRef.current = setInterval(() => {
      if (!mountedRef.current) return;
      remaining--;
      setCountdown(Math.max(0, remaining));
    }, 1000);

    // Actual retry timer
    retryTimerRef.current = setTimeout(async () => {
      if (!mountedRef.current) return;
      clearInterval(countdownTimerRef.current);
      setCountdown(0);

      const recovered = await performHealthCheck();
      if (!recovered && mountedRef.current) {
        setRetryCount(prev => prev + 1);
        scheduleRetry(attempt + 1);
      }
    }, delay);
  }, [getRetryDelay, performHealthCheck]);

  // Listen for backend-status-change events from API interceptor
  useEffect(() => {
    mountedRef.current = true;

    const handleStatusChange = (event) => {
      if (!mountedRef.current) return;
      const { available } = event.detail;
      
      if (!available && !backendDown) {
        setBackendDown(true);
        setRetryCount(0);
        // Start auto-retry
        scheduleRetry(0);
      } else if (available && backendDown) {
        setBackendDown(false);
        setRetryCount(0);
        setCountdown(0);
        // Clear any pending retries
        clearTimeout(retryTimerRef.current);
        clearInterval(countdownTimerRef.current);
      }
    };

    window.addEventListener('backend-status-change', handleStatusChange);

    return () => {
      mountedRef.current = false;
      window.removeEventListener('backend-status-change', handleStatusChange);
      clearTimeout(retryTimerRef.current);
      clearInterval(countdownTimerRef.current);
    };
  }, [backendDown, scheduleRetry]);

  // Initial health check on mount
  useEffect(() => {
    let cancelled = false;

    const initialCheck = async () => {
      const available = await checkBackendHealth(5000);
      if (cancelled) return;
      
      if (!available) {
        setBackendDown(true);
        window.__backendAvailable = false;
        scheduleRetry(0);
      } else {
        window.__backendAvailable = true;
      }
    };

    initialCheck();

    return () => { cancelled = true; };
  }, [scheduleRetry]);

  // Manual retry handler
  const handleManualRetry = async () => {
    clearTimeout(retryTimerRef.current);
    clearInterval(countdownTimerRef.current);
    setCountdown(0);

    const recovered = await performHealthCheck();
    if (!recovered) {
      setRetryCount(prev => prev + 1);
      scheduleRetry(retryCount + 1);
    }
  };

  // Don't render anything if backend is fine
  if (!backendDown) return null;

  return (
    <div className="bg-orange-50 border-b-2 border-orange-400 px-4 py-3 shadow-sm">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0">
            <span className="text-2xl">⚠️</span>
          </div>
          <div>
            <p className="font-semibold text-orange-800">
              Backend server is not running
            </p>
            <p className="text-sm text-orange-700">
              {checking
                ? 'Checking connection...'
                : countdown > 0
                  ? `Auto-retrying in ${countdown}s...`
                  : 'Start the backend server: open terminal → cd backend → npm run dev'
              }
            </p>
          </div>
        </div>
        
        <button
          onClick={handleManualRetry}
          disabled={checking}
          className="flex-shrink-0 bg-orange-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {checking ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Checking...
            </span>
          ) : 'Retry Now'}
        </button>
      </div>
    </div>
  );
};

export default BackendStatusBanner;
