import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, query, call, makeUser, login, adminSession, userSession, mkSponsor } from "./helpers";
const { closePool } = require("../lib/db");
const { hashPassword, verifyPassword } = require("../lib/auth");
const { updateUser, deleteUser } = require("../lib/users");

let handlers;

beforeEach(async () => {
  await resetDb();
  handlers = {
    login: (await import("../pages/api/auth/login.js")).default,
    me: (await import("../pages/api/auth/me.js")).default,
    logout: (await import("../pages/api/auth/logout.js")).default,
    families: (await import("../pages/api/families/index.js")).default,
    users: (await import("../pages/api/users/index.js")).default,
    userById: (await import("../pages/api/users/[id].js")).default,
    reset: (await import("../pages/api/admin/reset.js")).default,
    parse: (await import("../pages/api/admin/import/parse.js")).default,
    backups: (await import("../pages/api/backups/index.js")).default,
    download: (await import("../pages/api/backups/download.js")).default,
    exportsApi: (await import("../pages/api/exports/[type].js")).default
  };
});

afterAll(async () => {
  await closePool();
});

describe("authentification", () => {
  it("refuse un mot de passe incorrect et un utilisateur inconnu avec le même message", async () => {
    const user = await makeUser();
    const wrong = await call(handlers.login, { method: "POST", body: { username: user.username, password: "mauvais-mot-de-passe" } });
    const unknown = await call(handlers.login, { method: "POST", body: { username: "inconnu", password: "mauvais-mot-de-passe" } });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error).toBe(unknown.body.error);
    expect(wrong.headers["set-cookie"]).toBeUndefined();
  });

  it("refuse un compte désactivé", async () => {
    const user = await makeUser();
    await query("UPDATE users SET is_active = 0 WHERE id = ?", [user.id]);
    const res = await call(handlers.login, { method: "POST", body: { username: user.username, password: user.password } });
    expect(res.status).toBe(401);
  });

  it("limite les tentatives de connexion", async () => {
    const user = await makeUser();
    let last;
    for (let i = 0; i < 9; i++) last = await call(handlers.login, { method: "POST", body: { username: user.username, password: "faux-faux-faux1" } });
    expect(last.status).toBe(429);
    const ok = await call(handlers.login, { method: "POST", body: { username: user.username, password: user.password } });
    expect(ok.status).toBe(429);
  });

  it("stocke un hachage bcrypt et jamais le mot de passe", async () => {
    const user = await makeUser({ password: "SecretTrèsLong123" });
    const [row] = await query("SELECT password_hash FROM users WHERE id = ?", [user.id]);
    expect(row.password_hash).toMatch(/^\$2[aby]\$12\$/);
    expect(row.password_hash).not.toContain("SecretTrèsLong123");
    expect(await verifyPassword("SecretTrèsLong123", row.password_hash)).toBe(true);
    expect(await verifyPassword("autre", row.password_hash)).toBe(false);
    expect(await hashPassword("x1234567890")).not.toBe(await hashPassword("x1234567890"));
  });

  it("émet un cookie HttpOnly SameSite=Strict et stocke seulement l'empreinte du jeton", async () => {
    const user = await makeUser();
    const res = await call(handlers.login, { method: "POST", body: { username: user.username, password: user.password } });
    const cookie = String(res.headers["set-cookie"]);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    const token = decodeURIComponent(cookie.split(";")[0].split("=")[1]);
    const rows = await query("SELECT token_hash FROM sessions");
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).not.toBe(token);
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
  });

  it("expire les sessions et les supprime à la déconnexion", async () => {
    const session = await adminSession();
    expect((await call(handlers.me, { session })).status).toBe(200);
    await query("UPDATE sessions SET expires_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE)");
    expect((await call(handlers.me, { session })).status).toBe(401);
    const fresh = await adminSession();
    const out = await call(handlers.logout, { method: "POST", session: fresh });
    expect(out.status).toBe(200);
    expect((await call(handlers.me, { session: fresh })).status).toBe(401);
  });

  it("invalide la session d'un compte désactivé", async () => {
    const session = await userSession();
    await query("UPDATE users SET is_active = 0 WHERE id = ?", [session.user.id]);
    expect((await call(handlers.me, { session })).status).toBe(401);
  });
});

describe("autorisation", () => {
  it("renvoie 401 sans session sur les routes protégées", async () => {
    for (const h of [handlers.families, handlers.users, handlers.reset, handlers.backups]) {
      const res = await call(h, { method: "GET" });
      expect(res.status).toBe(401);
    }
    expect((await call(handlers.parse, { method: "POST", body: {} })).status).toBe(401);
  });

  it("interdit à un utilisateur standard toutes les fonctions administrateur", async () => {
    const session = await userSession();
    expect((await call(handlers.users, { session })).status).toBe(403);
    expect((await call(handlers.users, { method: "POST", session, body: { username: "xyz", password: "MotDePasse123", role: "admin" } })).status).toBe(403);
    expect((await call(handlers.reset, { session })).status).toBe(403);
    expect((await call(handlers.reset, { method: "POST", session, body: { scope: "families", confirmation: "REINITIALISER" } })).status).toBe(403);
    expect((await call(handlers.parse, { method: "POST", session, body: {} })).status).toBe(403);
    expect((await call(handlers.backups, { session })).status).toBe(403);
    expect((await call(handlers.download, { session, query: { id: "1", type: "excel" } })).status).toBe(403);
  });

  it("autorise un utilisateur standard sur les fonctions courantes", async () => {
    const session = await userSession();
    expect((await call(handlers.families, { session })).status).toBe(200);
  });

  it("exige le jeton CSRF et une origine valide pour les écritures", async () => {
    const session = await userSession();
    const sponsorId = await mkSponsor("Parrain Sécurité");
    const body = { representative: { fullName: "Test Famille", cin: "AB123456", phone: "0612345678" }, members: [], sponsorId };
    const noCsrf = await call(handlers.families, { method: "POST", body, headers: { cookie: session.cookie } });
    expect(noCsrf.status).toBe(403);
    const badCsrf = await call(handlers.families, { method: "POST", body, headers: { cookie: session.cookie, "x-csrf-token": "x".repeat(64) } });
    expect(badCsrf.status).toBe(403);
    const badOrigin = await call(handlers.families, { method: "POST", body, session, headers: { origin: "https://evil.example" } });
    expect(badOrigin.status).toBe(403);
    const ok = await call(handlers.families, { method: "POST", body, session });
    expect(ok.status).toBe(201);
  });

  it("refuse les méthodes non prévues", async () => {
    const session = await userSession();
    const res = await call(handlers.families, { method: "PATCH", session });
    expect(res.status).toBe(405);
  });

  it("ne divulgue jamais les empreintes de mots de passe", async () => {
    const session = await adminSession();
    const res = await call(handlers.users, { session });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/\$2[aby]\$/);
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
  });
});

describe("administrateurs", () => {
  it("empêche de retirer, désactiver ou supprimer le dernier administrateur actif", async () => {
    const admin = await makeUser({ role: "admin", username: "seuladmin" });
    await expect(updateUser(admin.id, { fullName: "A B", username: "seuladmin", role: "user", isActive: true }, null)).rejects.toMatchObject({ status: 409 });
    await expect(updateUser(admin.id, { fullName: "A B", username: "seuladmin", role: "admin", isActive: false }, null)).rejects.toMatchObject({ status: 409 });
    await expect(deleteUser(admin.id, 999)).rejects.toMatchObject({ status: 409 });
    const second = await makeUser({ role: "admin", username: "secondadmin" });
    await updateUser(admin.id, { fullName: "A B", username: "seuladmin", role: "user", isActive: true }, null);
    await expect(deleteUser(second.id, 999)).rejects.toMatchObject({ status: 409 });
  });

  it("empêche un administrateur de se rétrograder lui-même via l'API", async () => {
    const session = await adminSession();
    await makeUser({ role: "admin", username: "autreadmin" });
    const res = await call(handlers.userById, { method: "PUT", session, query: { id: String(session.user.id) }, body: { fullName: "Moi", username: "moi", role: "user", isActive: true } });
    expect(res.status).toBe(409);
  });

  it("crée un utilisateur, impose un mot de passe robuste et journalise l'action", async () => {
    const session = await adminSession();
    const weak = await call(handlers.users, { method: "POST", session, body: { username: "nouveau", password: "court", role: "user" } });
    expect(weak.status).toBe(400);
    const ok = await call(handlers.users, { method: "POST", session, body: { username: "nouveau", password: "MotDePasse123", role: "user" } });
    expect(ok.status).toBe(201);
    const dup = await call(handlers.users, { method: "POST", session, body: { username: "nouveau", password: "MotDePasse123", role: "user" } });
    expect(dup.status).toBe(409);
    const audits = await query("SELECT action FROM audit_logs WHERE action = 'user.create'");
    expect(audits.length).toBeGreaterThan(0);
  });

  it("réinitialise un mot de passe et révoque les sessions de l'utilisateur", async () => {
    const admin = await adminSession();
    const target = await makeUser({ username: "cible" });
    const targetSession = await login(target);
    const res = await call(handlers.userById, { method: "POST", session: admin, query: { id: String(target.id) }, body: { password: "NouveauMdp12345" } });
    expect(res.status).toBe(200);
    expect((await call(handlers.me, { session: targetSession })).status).toBe(401);
    const relog = await call(handlers.login, { method: "POST", body: { username: "cible", password: "NouveauMdp12345" } });
    expect(relog.status).toBe(200);
  });
});

describe("entrées malveillantes", () => {
  it("rejette un fichier qui n'est pas un classeur .xlsx", async () => {
    const session = await adminSession();
    const notXlsx = await call(handlers.parse, { method: "POST", session, body: { filename: "malveillant.exe", contentBase64: Buffer.from("MZ").toString("base64") } });
    expect(notXlsx.status).toBe(400);
    const fake = await call(handlers.parse, { method: "POST", session, body: { filename: "faux.xlsx", contentBase64: Buffer.from("ceci n'est pas un zip").toString("base64") } });
    expect(fake.status).toBe(400);
    const corrupt = await call(handlers.parse, { method: "POST", session, body: { filename: "corrompu.xlsx", contentBase64: Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("garbage")]).toString("base64") } });
    expect(corrupt.status).toBe(400);
  });

  it("traite les caractères d'injection comme des données", async () => {
    const session = await userSession();
    const sponsorId = await mkSponsor("Parrain Injection");
    const res = await call(handlers.families, {
      method: "POST",
      session,
      body: { representative: { fullName: "Robert'); DROP TABLE families;--", cin: "AB123456", phone: "0612345678" }, members: [{ fullName: "<script>alert(1)</script>" }], sponsorId }
    });
    expect(res.status).toBe(201);
    const [{ c }] = await query("SELECT COUNT(*) AS c FROM families");
    expect(c).toBe(1);
    const list = await call(handlers.families, { session, query: { q: "x' OR '1'='1" } });
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(0);
  });

  it("refuse un type d'export inconnu", async () => {
    const session = await userSession();
    const res = await call(handlers.exportsApi, { session, query: { type: "../../etc/passwd" } });
    expect(res.status).toBe(400);
  });
});
