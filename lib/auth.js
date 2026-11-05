const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { query } = require("./db");
const { HttpError } = require("./errors");

const BCRYPT_ROUNDS = 12;

function cookieName() {
  return process.env.SESSION_COOKIE_NAME || "rbm_session";
}

function sessionTtlMs() {
  return Number(process.env.SESSION_TTL_HOURS || 12) * 3600 * 1000;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function validatePasswordStrength(password) {
  if (typeof password !== "string" || password.length < 10) {
    throw new HttpError(400, "Le mot de passe doit contenir au moins 10 caractères.");
  }
  if (password.length > 72) {
    throw new HttpError(400, "Le mot de passe ne doit pas dépasser 72 caractères.");
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new HttpError(400, "Le mot de passe doit contenir des lettres et des chiffres.");
  }
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    out[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return out;
}

function buildCookie(value, maxAgeSeconds) {
  const parts = [`${cookieName()}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Strict", `Max-Age=${maxAgeSeconds}`];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const csrf = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + sessionTtlMs());
  await query("INSERT INTO sessions (token_hash, user_id, csrf_token, expires_at) VALUES (?, ?, ?, ?)", [sha256(token), userId, csrf, expires]);
  return { token, csrf, expires };
}

async function loadSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[cookieName()];
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const rows = await query(
    `SELECT s.token_hash, s.csrf_token, s.expires_at, u.id, u.username, u.role, u.is_active
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP()`,
    [sha256(token)]
  );
  const row = rows[0];
  if (!row || !row.is_active) return null;
  return {
    csrf: row.csrf_token,
    user: { id: row.id, username: row.username, role: row.role }
  };
}

async function destroySession(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[cookieName()];
  if (token) await query("DELETE FROM sessions WHERE token_hash = ?", [sha256(token)]);
}

async function checkRateLimit(bucketSource, maxHits, windowSeconds) {
  const bucket = sha256(bucketSource);
  const rows = await query("SELECT hits, window_start FROM rate_limits WHERE bucket = ?", [bucket]);
  const row = rows[0];
  if (!row) return { blocked: false, bucket };
  const startedMs = new Date(row.window_start.replace(" ", "T") + "Z").getTime();
  if (Date.now() - startedMs > windowSeconds * 1000) {
    await query("DELETE FROM rate_limits WHERE bucket = ?", [bucket]);
    return { blocked: false, bucket };
  }
  return { blocked: row.hits >= maxHits, bucket };
}

async function registerRateHit(bucketSource, windowSeconds) {
  const bucket = sha256(bucketSource);
  await query(
    `INSERT INTO rate_limits (bucket, hits, window_start) VALUES (?, 1, UTC_TIMESTAMP())
     ON DUPLICATE KEY UPDATE
       hits = IF(TIMESTAMPDIFF(SECOND, window_start, UTC_TIMESTAMP()) > ?, 1, hits + 1),
       window_start = IF(TIMESTAMPDIFF(SECOND, window_start, UTC_TIMESTAMP()) > ?, UTC_TIMESTAMP(), window_start)`,
    [bucket, windowSeconds, windowSeconds]
  );
}

async function clearRateLimit(bucketSource) {
  await query("DELETE FROM rate_limits WHERE bucket = ?", [sha256(bucketSource)]);
}

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  const lenOk = bufA.length === bufB.length;
  const padded = lenOk ? bufB : Buffer.alloc(bufA.length);
  const equal = crypto.timingSafeEqual(bufA, padded);
  return lenOk && equal;
}

module.exports = {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
  createSession,
  loadSession,
  destroySession,
  buildCookie,
  checkRateLimit,
  registerRateHit,
  clearRateLimit,
  sessionTtlMs,
  safeEqual,
  sha256
};
