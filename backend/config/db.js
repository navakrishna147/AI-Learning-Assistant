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
// Only needed when using Atlas/SRV URIs. Skip for local mongodb://127.0.0.1.
const uriForDNSCheck = process.env.MONGODB_URI || '';
if (uriForDNSCheck.startsWith('mongodb+srv://')) {
  try {
    const servers = dns.getServers();
    const onlyLocal = servers.every(s => s === '127.0.0.1' || s === '::1');
    if (onlyLocal) {
      dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1', ...servers]);
      console.log('ℹ️  DNS: Prepended public resolvers for SRV lookup support');
    }
  } catch { /* non-critical */ }
}

// ── Private state ───────────────────────────────────────────────────────────
let connectionAttempts = 0;
const MAX_RETRIES = 5;

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

  // On Windows after a reboot the MongoDB service may report "Running" before
  // it is actually accepting connections. A brief initial pause prevents the
  // very first attempt from failing with ECONNREFUSED.
  if (connectionAttempts === 0 && uri.includes('127.0.0.1')) {
    console.log('⏳ Waiting 2 s for local MongoDB service to stabilize after boot…');
    await sleep(2000);
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
        const delay = 3000 * connectionAttempts; // 3s, 6s, 9s, 12s — generous for service startup
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
  try {
    await mongoose.disconnect();
    console.log('✅ MongoDB disconnected gracefully');
  } catch (err) {
    console.error('❌ Error disconnecting MongoDB:', err.message);
  }
};

export default connectDB;
