const { query } = require("../../../lib/db");
const { route, clientIp } = require("../../../lib/http");
const { HttpError } = require("../../../lib/errors");
const { verifyPassword, createSession, buildCookie, sessionTtlMs, checkRateLimit, registerRateHit, clearRateLimit } = require("../../../lib/auth");

const DUMMY_HASH = "$2a$12$C6UzMDM.H6dfI/f/IKcEeO5nZ9sJ0nQxqZ8uQ0b8Yk5eWl4Zk3b1y";
const MAX_ATTEMPTS = 8;
const WINDOW_SECONDS = 15 * 60;

async function login(req, res) {
  const body = req.body || {};
  const username = typeof body.username === "string" ? body.username.replace(/\s+/g, " ").trim().slice(0, 60) : "";
  const password = typeof body.password === "string" ? body.password.slice(0, 200) : "";
  if (!username || !password) throw new HttpError(400, "Identifiant et mot de passe requis.");
  const ipBucket = `login:ip:${clientIp(req)}`;
  const userBucket = `login:user:${username.toLowerCase()}`;
  const [ipState, userState] = await Promise.all([checkRateLimit(ipBucket, MAX_ATTEMPTS * 3, WINDOW_SECONDS), checkRateLimit(userBucket, MAX_ATTEMPTS, WINDOW_SECONDS)]);
  if (ipState.blocked || userState.blocked) throw new HttpError(429, "Trop de tentatives. Réessayez dans quelques minutes.");
  const rows = await query("SELECT id, username, password_hash, role, is_active FROM users WHERE username = ?", [username]);
  const user = rows[0];
  const ok = await verifyPassword(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok || !user.is_active) {
    await Promise.all([registerRateHit(ipBucket, WINDOW_SECONDS), registerRateHit(userBucket, WINDOW_SECONDS)]);
    throw new HttpError(401, "Identifiant ou mot de passe incorrect.");
  }
  await clearRateLimit(userBucket);
  const session = await createSession(user.id);
  await query("UPDATE users SET last_login_at = UTC_TIMESTAMP() WHERE id = ?", [user.id]);
  res.setHeader("Set-Cookie", buildCookie(session.token, Math.floor(sessionTtlMs() / 1000)));
  res.status(200).json({ user: { id: user.id, username: user.username, role: user.role }, csrf: session.csrf });
}

export default route({ POST: login }, { auth: false });
