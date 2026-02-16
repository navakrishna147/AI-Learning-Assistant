import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// CRITICAL: Use 127.0.0.1 instead of "localhost" to avoid Windows IPv6
// resolution issues where localhost → ::1 but the backend listens on 0.0.0.0 (IPv4).
const BACKEND_TARGET = 'http://127.0.0.1:5000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true, // Fail if 5173 is busy — keeps proxy consistent

    // ========== PROXY CONFIGURATION ==========
    proxy: {
      '/api': {
        target: BACKEND_TARGET,
        changeOrigin: true,
        secure: false,
        ws: true,
        // Timeout: wait longer for backend to start after reboot
        timeout: 60000,
        configure: (proxy, _options) => {
          let lastErrorLog = 0;
          proxy.on('error', (err, _req, res) => {
            // Throttle ECONNREFUSED logs to once per 5 seconds
            const now = Date.now();
            if (err.code === 'ECONNREFUSED') {
              if (now - lastErrorLog > 5000) {
                console.error(`[proxy] Backend not running on ${BACKEND_TARGET}. Start: cd backend && npm run dev`);
                lastErrorLog = now;
              }
            } else {
              console.error(`[proxy] ${err.code || err.message} → ${BACKEND_TARGET}`);
            }
            if (!res.headersSent) {
              res.writeHead(502, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                error: 'Backend unavailable',
                message: 'Backend server is not running. Please start the backend server.',
                code: 'BACKEND_UNAVAILABLE',
                isProxyError: true
              }));
            }
          });
          proxy.on('proxyReq', (_p, req) => {
            console.log(`[proxy] ${req.method} ${req.url} → ${BACKEND_TARGET}`);
          });
        },
      },
    },

    // ========== FILE WATCHING ==========
    watch: {
      usePolling: false,
      ignored: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
    },

    cors: true,
    fs: { strict: false },
  },
  
  // ========== BUILD CONFIGURATION ==========
  build: {
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
    outDir: 'dist',
    assetsDir: 'assets',
    // Disable inline chunks for better caching
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['react', 'react-dom', 'react-router-dom'],
          'api': ['axios'],
        }
      }
    }
  },
  
  // ========== ESBUILD CONFIGURATION ==========
  esbuild: {
    logLevel: 'info',
    supported: {
      bigint: true
    }
  },
  
  // ========== ENVIRONMENT VARIABLES ==========
  define: {
    'process.env': {}
  }
});