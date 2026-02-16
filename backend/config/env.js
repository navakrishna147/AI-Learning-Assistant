/**
 * ============================================================================
 * ENVIRONMENT LOADER & VALIDATOR — SINGLE SOURCE OF TRUTH
 * ============================================================================
 *
 * This module MUST be the very first import in server.js.
 * It loads .env, validates every required variable, and exports a frozen
 * config object.  If any required variable is missing or invalid the process
 * exits immediately with a clear diagnostic — no silent fallbacks.
 *
 * Design decisions:
 *  - dotenv is called once here; environment.js is no longer needed.
 *  - Validation runs at import time so no downstream module ever reads
 *    an undefined env var.
 *  - The config object is Object.freeze'd to prevent accidental mutation.
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// ── Resolve .env path relative to the backend root ──────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const BACKEND_ROOT = path.resolve(__dirname, '..');

const envFile = process.env.NODE_ENV === 'production'
  ? path.join(BACKEND_ROOT, '.env.production')
  : path.join(BACKEND_ROOT, '.env');

// On Render / Railway / cloud platforms env vars are injected by the platform
// — the .env file may not exist, and that is perfectly fine.
const isCloudPlatform = !!(process.env.RENDER || process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID);
const dotenvResult = dotenv.config({ path: envFile });
if (dotenvResult.error && !isCloudPlatform) {
  // Only warn in non-cloud environments; don't crash.
  console.warn(`⚠️  Could not load ${envFile}: ${dotenvResult.error.message}`);
  console.warn('   Continuing with system environment variables…');
} else if (!dotenvResult.error) {
  console.log(`✅ Environment loaded from: ${envFile}`);
}

// ── Validation schema ───────────────────────────────────────────────────────
const REQUIRED = [
  {
    key: 'PORT',
    validate: (v) => {
      const n = Number(v);
      return Number.isInteger(n) && n >= 1 && n <= 65535;
    },
    hint: 'Must be an integer between 1 and 65535 (e.g. PORT=5000)',
  },
  {
    key: 'MONGODB_URI',
    validate: (v) => /^mongodb(\+srv)?:\/\/.+/.test(v),
    hint: 'Must start with mongodb:// or mongodb+srv://',
  },
  {
    key: 'JWT_SECRET',
    validate: (v) => typeof v === 'string' && v.length >= 16,
    hint: 'Must be at least 16 characters long',
  },
  {
    key: 'CLIENT_URL',
    validate: (v) => /^https?:\/\/.+/.test(v),
    hint: 'Must be a valid URL (e.g. http://localhost:5173)',
  },
];

const OPTIONAL = [
  { key: 'NODE_ENV',        fallback: 'development' },
  { key: 'GROQ_API_KEY',    fallback: '' },
  { key: 'FRONTEND_URL',    fallback: '' },
  { key: 'CORS_ORIGINS',    fallback: '' },
  { key: 'EMAIL_USER',      fallback: '' },
  { key: 'EMAIL_PASSWORD',  fallback: '' },
  { key: 'MAX_FILE_SIZE',   fallback: '10485760' },
];

// ── Run validation ──────────────────────────────────────────────────────────
const errors = [];

// Allow FRONTEND_URL as an alias for CLIENT_URL (back-compat)
if (!process.env.CLIENT_URL && process.env.FRONTEND_URL) {
  process.env.CLIENT_URL = process.env.FRONTEND_URL;
}

for (const { key, validate, hint } of REQUIRED) {
  const val = process.env[key];
  if (!val) {
    errors.push(`  ✗ ${key} is MISSING — ${hint}`);
  } else if (validate && !validate(val)) {
    errors.push(`  ✗ ${key} is INVALID ("${val.slice(0, 40)}…") — ${hint}`);
  }
}

if (errors.length > 0) {
  const divider = '═'.repeat(70);
  console.error(`\n${divider}`);
  console.error('❌  ENVIRONMENT VALIDATION FAILED — cannot start server');
  console.error(divider);
  errors.forEach((e) => console.error(e));
  console.error('');
  console.error('Fix your .env file (or set these as system environment variables)');
  console.error(`Searched: ${envFile}`);
  console.error(`${divider}\n`);
  process.exit(1);
}

// ── Build frozen config object ──────────────────────────────────────────────
const raw = {};
for (const { key } of REQUIRED) raw[key] = process.env[key];
for (const { key, fallback } of OPTIONAL) raw[key] = process.env[key] || fallback;

if (!['development', 'staging', 'production', 'test'].includes(raw.NODE_ENV)) {
  raw.NODE_ENV = 'development';
}

raw.PORT          = Number(raw.PORT);
raw.MAX_FILE_SIZE = Number(raw.MAX_FILE_SIZE) || 10485760;
if (!raw.FRONTEND_URL) raw.FRONTEND_URL = raw.CLIENT_URL;

export const config = Object.freeze(raw);

// ── Convenience exports ─────────────────────────────────────────────────────
export const isDevelopment = config.NODE_ENV === 'development';
export const isProduction  = config.NODE_ENV === 'production';
export const isStaging     = config.NODE_ENV === 'staging';

/**
 * Return CORS origin whitelist.
 * Includes CLIENT_URL automatically plus any extra origins in CORS_ORIGINS.
 */
export const getCORSOrigins = () => {
  const set = new Set();
  set.add(config.CLIENT_URL);
  if (isDevelopment) {
    ['http://localhost:5173','http://localhost:5174',
     'http://127.0.0.1:5173','http://127.0.0.1:5174'].forEach(o => set.add(o));
  }
  if (config.CORS_ORIGINS) {
    config.CORS_ORIGINS.split(',').map(o => o.trim()).filter(Boolean).forEach(o => set.add(o));
  }
  return [...set];
};

/** Backward-compat stub — validation already ran above. */
export const validateEnvironment = () => config;

export default config;
