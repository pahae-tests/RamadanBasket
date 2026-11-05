import { Writable } from "stream";
const { getPool, query } = require("../lib/db");
const { applySchema } = require("../lib/schema");
const { createUser } = require("../lib/users");
const { invalidateSearch } = require("../lib/search");

const TABLES = [
  "import_errors",
  "import_sessions",
  "distribution_assignments",
  "distributions",
  "family_members",
  "families",
  "sponsors",
  "vendors",
  "audit_logs",
  "backup_runs",
  "sessions",
  "rate_limits",
  "users"
];

let schemaReady = false;

export async function resetDb() {
  const pool = getPool();
  if (!schemaReady) {
    await pool.query("SET FOREIGN_KEY_CHECKS = 0");
    const [tables] = await pool.query("SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()");
    for (const t of tables) await pool.query(`DROP TABLE IF EXISTS \`${t.name || t.NAME || t.TABLE_NAME}\``);
    await pool.query("SET FOREIGN_KEY_CHECKS = 1");
    await applySchema();
    schemaReady = true;
  }
  await pool.query("SET FOREIGN_KEY_CHECKS = 0");
  for (const table of TABLES) await pool.query(`TRUNCATE TABLE \`${table}\``);
  await pool.query("SET FOREIGN_KEY_CHECKS = 1");
  invalidateSearch();
}

export function makeRes() {
  const chunks = [];
  const res = new Writable({
    write(chunk, enc, cb) {
      chunks.push(Buffer.from(chunk));
      cb();
    }
  });
  res.statusCode = 200;
  res.headers = {};
  res.jsonBody = undefined;
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.setHeader = (k, v) => {
    res.headers[k.toLowerCase()] = v;
  };
  res.json = (body) => {
    res.jsonBody = body;
    res.finished = true;
    return res;
  };
  res.chunks = chunks;
  return res;
}

export async function call(handler, { method = "GET", query: q = {}, body, headers = {}, session } = {}) {
  const req = {
    method,
    query: q,
    body,
    headers: { host: "localhost:3000", ...headers },
    socket: { remoteAddress: "127.0.0.1" }
  };
  if (session) {
    req.headers.cookie = session.cookie;
    if (method !== "GET") req.headers["x-csrf-token"] = session.csrf;
  }
  const res = makeRes();
  await handler(req, res);
  return { status: res.statusCode, body: res.jsonBody, headers: res.headers, raw: Buffer.concat(res.chunks), res };
}

export async function makeUser(overrides = {}) {
  const username = overrides.username || `user${Math.floor(Math.random() * 1e9)}`;
  const id = await createUser(
    { username, password: overrides.password || "MotDePasse123", role: overrides.role || "user" },
    null
  );
  return { id, username, password: overrides.password || "MotDePasse123" };
}

export async function login(user) {
  const handler = (await import("../pages/api/auth/login.js")).default;
  const res = await call(handler, { method: "POST", body: { username: user.username, password: user.password } });
  if (res.status !== 200) throw new Error(`login failed ${res.status}`);
  const cookie = String(res.headers["set-cookie"]).split(";")[0];
  return { cookie, csrf: res.body.csrf, user: res.body.user };
}

export async function adminSession() {
  const user = await makeUser({ role: "admin", username: `admin${Math.floor(Math.random() * 1e9)}` });
  return login(user);
}

export async function userSession() {
  const user = await makeUser({ role: "user", username: `std${Math.floor(Math.random() * 1e9)}` });
  return login(user);
}

export { query };

const { createSponsor, createVendor } = require("../lib/entities");
const { createFamily } = require("../lib/families");

let counter = 0;

export async function mkSponsor(name = "Parrain Test", extra = {}) {
  counter += 1;
  return createSponsor({ fullName: name, cin: extra.cin === undefined ? `SP${String(100000 + counter)}` : extra.cin, phone: extra.phone || "" }, null, { force: true });
}

export async function mkVendor(name = "Vendeur Test", extra = {}) {
  return createVendor({ name, phone: extra.phone || "" }, null, { force: true });
}

export async function mkFamily(name, sponsorId, extra = {}) {
  counter += 1;
  return createFamily(
    {
      representative: { fullName: name, cin: extra.cin || `AB${String(200000 + counter)}`, phone: extra.phone || "0612345678" },
      members: extra.members || [],
      sponsorId
    },
    null
  );
}
