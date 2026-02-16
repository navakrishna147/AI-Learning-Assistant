/**
 * ============================================================================
 * MONGODB CONNECTION MODULE — PRODUCTION GRADE
 * ============================================================================
 *
 * Guarantees:
 *  1. connectDB() is the ONLY way to connect — it blocks until success or
 *     all retries are exhausted.
 *  2. In production the process exits if the database cannot be reached.
 *  3. In development the process ALSO exits — we deliberately do NOT allow
 *     "limited mode" because it silently causes ECONNREFUSED down the line.
 *  4. After initial connection, mongoose automatic reconnection handles
 *     transient disconnects (sleep/wake, network blips).
 *  5. TCP keepalive is enabled so stale sockets are detected quickly.
 */

import mongoose from 'mongoose';
import dns from 'dns';

// ── Fix DNS for mongodb+srv:// on machines with local resolvers ─────────────
// SRV record lookups require DNS servers that support SRV queries.
// Many ISP / corporate / hotspot DNS servers silently fail SRV lookups,
// which causes "querySrv ECONNREFUSED" or "querySrv ETIMEOUT".
// We ALWAYS prepend reliable public resolvers when using Atlas SRV URIs.
const uriForDNSCheck = process.env.MONGODB_URI || '';
if (uriForDNSCheck.startsWith('mongodb+srv://')) {
  try {
    const currentServers = dns.getServers();
    const publicDNS = ['8.8.8.8', '8.8.4.4', '1.1.1.1'];
    // Only add public servers that aren't already present
    const toAdd = publicDNS.filter(s => !currentServers.includes(s));
    if (toAdd.length > 0) {
      dns.setServers([...toAdd, ...currentServers]);
      console.log('ℹ️  DNS: Prepended public resolvers for SRV lookup support');
    }
  } catch { /* non-critical */ }
}

// ── Private state ───────────────────────────────────────────────────────────
let connectionAttempts = 0;
const MAX_RETRIES = 7;

// ── Mongoose connection options ─────────────────────────────────────────────
const getConnectionOptions = () => ({
  serverSelectionTimeoutMS: 15000,   // 15s — generous for Windows service startup after reboot
  connectTimeoutMS: 20000,           // 20s — allow slow first connection after laptop restart
  socketTimeoutMS: 45000,
  heartbeatFrequencyMS: 5000,        // detect reconnection faster
  maxPoolSize: 10,
  minPoolSize: 2,
  retryWrites: true,
  retryReads: true,
  autoIndex: true,
  family: 4,                         // force IPv4 — prevents ::1 issues on Windows
});

// ── Event listeners (set up ONCE before first connect) ──────────────────────
let listenersAttached = false;

const attachEventListeners = () => {
  if (listenersAttached) return;
  listenersAttached = true;

  mongoose.connection.on('connected', () => {
    console.log('✅ MongoDB CONNECTED — ready for operations');
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('⚠️  MongoDB DISCONNECTED — mongoose will auto-reconnect');
  });

  mongoose.connection.on('reconnected', () => {
    console.log('✅ MongoDB RECONNECTED — connection restored');
  });

  mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB connection error:', err.message);
  });
};

// ── Main connect function ───────────────────────────────────────────────────
/**
 * Connect to MongoDB with retries.
 * Resolves with the mongoose connection or throws (never resolves null).
 */
const connectDB = async () => {
  attachEventListeners();

  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error(
      'FATAL: MONGODB_URI environment variable is not set.\n' +
      '  • On Render: Add MONGODB_URI in Dashboard → Environment → Environment Variables\n' +
      '  • Locally: Add MONGODB_URI to your .env file\n' +
      '  • Format : mongodb+srv://USER:PASS@cluster.mongodb.net/DB?retryWrites=true&w=majority'
    );
  }

  // On Windows after a reboot the MongoDB service (or DNS for Atlas) may not
  // be fully ready. A brief initial pause prevents the very first attempt from
  // failing with ECONNREFUSED (local) or ETIMEOUT (Atlas SRV lookup).
  if (connectionAttempts === 0) {
    const isLocal = uri.includes('127.0.0.1') || uri.includes('localhost');
    const delayMs = isLocal ? 2000 : 3000;
    const reason = isLocal
      ? 'local MongoDB service to stabilize after boot'
      : 'DNS/network to stabilize for Atlas SRV lookup';
    console.log(`⏳ Waiting ${delayMs / 1000}s for ${reason}…`);
    await sleep(delayMs);
  }

  while (connectionAttempts < MAX_RETRIES) {
    connectionAttempts++;
    try {
      console.log(`📍 MongoDB connection attempt ${connectionAttempts}/${MAX_RETRIES}`);
      console.log(`   URI: ${uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`); // mask creds

      const conn = await mongoose.connect(uri, getConnectionOptions());

      connectionAttempts = 0; // reset for future reconnect tracking
      const { host, port, name } = conn.connection;

      console.log('═'.repeat(60));
      console.log('✅ MONGODB CONNECTED SUCCESSFULLY');
      console.log(`   Host: ${host}:${port}  Database: ${name}`);
      console.log('═'.repeat(60));

      return conn;
    } catch (err) {
      console.error(`❌ Attempt ${connectionAttempts} failed: ${err.message}`);
      classifyError(err);

      if (connectionAttempts < MAX_RETRIES) {
        // Exponential backoff: 2s, 4s, 8s, 12s, 15s, 15s, 15s (capped)
        const delay = Math.min(2000 * Math.pow(2, connectionAttempts - 1), 15000);
        console.log(`   Retrying in ${delay / 1000}s …\n`);
        await sleep(delay);
      }
    }
  }

  // All retries exhausted — fail hard
  const msg =
    `FATAL: Could not connect to MongoDB after ${MAX_RETRIES} attempts.\n` +
    `  • Is mongod / mongos running?\n` +
    `  • Is MONGODB_URI correct? (${uri})\n` +
    `  • Is the network reachable?`;
  throw new Error(msg);
};

// ── Helpers ─────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const classifyError = (err) => {
  if (err.code === 'ECONNREFUSED')
    console.error('   → MongoDB server is not accepting connections');
  else if (err.code === 'ENOTFOUND')
    console.error('   → DNS lookup failed — check MONGODB_URI hostname');
  else if (err.name === 'MongoParseError')
    console.error('   → Connection string is malformed');
  else if (err.name === 'MongoNetworkError')
    console.error('   → Network unreachable — check firewall / VPN');
};

// ── Health probe ────────────────────────────────────────────────────────────
/**
 * Returns a health-check object suitable for /api/health.
 */
export const checkDBHealth = async () => {
  const state = mongoose.connection.readyState;
  const states = { 0: 'Disconnected', 1: 'Connected', 2: 'Connecting', 3: 'Disconnecting' };
  let responsive = false;

  if (state === 1) {
    try {
      await mongoose.connection.db.admin().ping();
      responsive = true;
    } catch { /* ping failed */ }
  }

  return {
    connected: state === 1 && responsive,
    state: states[state] || 'Unknown',
    responsive,
    host: mongoose.connection.host || 'n/a',
    database: mongoose.connection.name || 'n/a',
    timestamp: new Date().toISOString(),
  };
};

/** Convenience boolean check */
export const isDBConnected = () =>
  mongoose.connection.readyState === 1;

/** Graceful disconnect */
export const disconnectDB = async () => {
  stopConnectionMonitor();
  try {
    await mongoose.disconnect();
    console.log('✅ MongoDB disconnected gracefully');
  } catch (err) {
    console.error('❌ Error disconnecting MongoDB:', err.message);
  }
};

// ── Connection Monitor (sleep/wake resilience) ─────────────────────────────
// After laptop sleep, Atlas TCP connections go stale. Mongoose's built-in
// auto-reconnect often succeeds, but on prolonged sleep it can fail silently
// leaving readyState stuck at 0. This monitor detects that and forces a
// manual reconnect after a grace period.
let _monitorTimer = null;
const MONITOR_INTERVAL_MS = 15_000;   // check every 15 seconds (faster sleep/wake detection)
const RECONNECT_GRACE_MS  = 10_000;   // wait 10s for auto-reconnect first
let _lastDisconnectedAt = null;
let _reconnecting = false;

/**
 * Start background connection monitor. Call once after initial connect.
 * The timer is unref'd so it won't prevent process.exit().
 */
export const startConnectionMonitor = () => {
  if (_monitorTimer) return; // already running

  _monitorTimer = setInterval(async () => {
    if (_reconnecting) return; // skip if a reconnect is already in progress

    const state = mongoose.connection.readyState;

    if (state === 1) {
      // Connected — verify with a lightweight ping
      try {
        await mongoose.connection.db.admin().ping();
        _lastDisconnectedAt = null; // healthy
      } catch (err) {
        console.warn('⚠️  MongoDB ping failed despite connected state:', err.message);
        _lastDisconnectedAt = _lastDisconnectedAt || Date.now();
      }
      return;
    }

    if (state === 2) return; // connecting — let it proceed

    // state === 0 (disconnected) or 3 (disconnecting)
    if (!_lastDisconnectedAt) {
      _lastDisconnectedAt = Date.now();
      console.warn('⚠️  MongoDB disconnected — waiting for auto-reconnect…');
      return;
    }

    const elapsed = Date.now() - _lastDisconnectedAt;
    if (elapsed < RECONNECT_GRACE_MS) return; // still within grace period

    // Grace period exceeded — force manual reconnect
    _reconnecting = true;
    console.log('🔄 Auto-reconnect grace period exceeded. Forcing manual reconnect…');
    try {
      // Close stale handle first (ignore errors — it may already be dead)
      try { await mongoose.disconnect(); } catch { /* ignore */ }
      connectionAttempts = 0; // reset retry counter
      await connectDB();
      _lastDisconnectedAt = null;
      console.log('✅ Manual reconnection successful after sleep/wake');
    } catch (err) {
      console.error('❌ Manual reconnection failed:', err.message);
      console.error('   Will retry on next monitor cycle (30s)…');
      // Don't reset _lastDisconnectedAt — next cycle will retry immediately
    } finally {
      _reconnecting = false;
    }
  }, MONITOR_INTERVAL_MS);

  // Don't let the monitor prevent clean process exit
  _monitorTimer.unref();
  console.log('✅ MongoDB connection monitor started (15s health check interval)');
};

/**
 * Stop the connection monitor (call during graceful shutdown).
 */
export const stopConnectionMonitor = () => {
  if (_monitorTimer) {
    clearInterval(_monitorTimer);
    _monitorTimer = null;
  }
};

export default connectDB;
