import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";
import { execSync } from "child_process";
import ExcelJS from "exceljs";
import { resetDb, query, call, adminSession, userSession } from "./helpers";
const S3rver = require("s3rver");
const { closePool, getPool } = require("../lib/db");
const { createFamily } = require("../lib/families");
const { createVendor, createSponsor } = require("../lib/entities");
const D = require("../lib/distributions");
const excelModule = require("../lib/excel");
const sqlDumpModule = require("../lib/sqlDump");
const storage = require("../lib/storage");

let s3;
let dir;
let create;
let list;
let download;
let manualRun;

const PORT = 4569;
const secret = process.env.BACKUP_API_SECRET;
const auth = { authorization: `Bearer ${secret}` };

function configureStorage(endpoint = `http://127.0.0.1:${PORT}`) {
  process.env.BACKUP_STORAGE_ENDPOINT = endpoint;
  process.env.BACKUP_STORAGE_BUCKET = "rbm-backups";
  process.env.BACKUP_STORAGE_REGION = "us-east-1";
  process.env.BACKUP_STORAGE_ACCESS_KEY_ID = "S3RVER";
  process.env.BACKUP_STORAGE_SECRET_ACCESS_KEY = "S3RVER";
  process.env.BACKUP_STORAGE_FORCE_PATH_STYLE = "true";
  global.__rbmS3 = null;
}

async function runBackup() {
  return call(create, { method: "POST", headers: auth });
}

async function seed() {
  const vendor = await createVendor({ name: "Vendeur Sauvegarde" }, null);
  const sponsorId = await createSponsor({ fullName: "Parrain d'Été \"Test\"", cin: "PP111111" }, null);
  const ids = [];
  for (let i = 0; i < 5; i++) {
    ids.push(await createFamily({ representative: { fullName: `Famille Sauvegarde ${i}`, cin: `SS10000${i}`, phone: `060000001${i}` }, members: [{ fullName: `Membre 'apostrophe' é à ç ${i}`, phone: `060000001${i}` }], sponsorId }, null));
  }
  await D.createDistribution({ date: "2026-03-01", assignments: ids.map((id) => ({ familyId: id, vendorId: vendor })) }, null);
  return ids;
}

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "rbm-s3-"));
  s3 = new S3rver({ port: PORT, address: "127.0.0.1", silent: true, directory: dir, configureBuckets: [{ name: "rbm-backups" }] });
  await s3.run();
  create = (await import("../pages/api/backups/create.jsx")).default;
  list = (await import("../pages/api/backups/index.js")).default;
  download = (await import("../pages/api/backups/download.js")).default;
  manualRun = (await import("../pages/api/backups/run.js")).default;
});

afterAll(async () => {
  await s3.close();
  fs.rmSync(dir, { recursive: true, force: true });
  await closePool();
});

beforeEach(async () => {
  vi.restoreAllMocks();
  configureStorage();
  process.env.BACKUP_API_SECRET = secret;
  await resetDb();
});

describe("authentification du point d'entrée", () => {
  it("rejette les méthodes autres que POST", async () => {
    for (const method of ["GET", "PUT", "DELETE", "PATCH"]) {
      const res = await call(create, { method, headers: auth });
      expect(res.status).toBe(405);
      expect(res.headers.allow).toBe("POST");
    }
    expect((await query("SELECT COUNT(*) AS c FROM backup_runs"))[0].c).toBe(0);
  });

  it("rejette l'absence de secret et un secret invalide", async () => {
    expect((await call(create, { method: "POST" })).status).toBe(401);
    expect((await call(create, { method: "POST", headers: { authorization: "Bearer mauvais" } })).status).toBe(401);
    expect((await call(create, { method: "POST", headers: { authorization: process.env.BACKUP_API_SECRET } })).status).toBe(401);
    expect((await call(create, { method: "POST", headers: { authorization: `Basic ${process.env.BACKUP_API_SECRET}` } })).status).toBe(401);
    expect((await call(create, { method: "POST", headers: { authorization: `Bearer ${process.env.BACKUP_API_SECRET}x` } })).status).toBe(401);
    expect((await query("SELECT COUNT(*) AS c FROM backup_runs"))[0].c).toBe(0);
  });

  it("refuse tout accès si le secret n'est pas configuré côté serveur", async () => {
    delete process.env.BACKUP_API_SECRET;
    const res = await call(create, { method: "POST", headers: { authorization: "Bearer " } });
    expect(res.status).toBe(500);
    const res2 = await call(create, { method: "POST", headers: { authorization: "Bearer undefined" } });
    expect(res2.status).toBe(500);
  });

  it("limite les tentatives échouées", async () => {
    let last;
    for (let i = 0; i < 22; i++) last = await call(create, { method: "POST", headers: { authorization: "Bearer faux" } });
    expect(last.status).toBe(429);
    const valid = await runBackup();
    expect(valid.status).toBe(429);
  });

  it("ne divulgue jamais le secret dans la réponse", async () => {
    await seed();
    const res = await runBackup();
    expect(JSON.stringify(res.body)).not.toContain(process.env.BACKUP_API_SECRET);
    expect(JSON.stringify(res.body)).not.toContain("S3RVER");
  });
});

describe("exécution de la sauvegarde", () => {
  it("crée un SQL compressé et un instantané Excel dans le stockage objet", async () => {
    await seed();
    const res = await runBackup();
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.sql.status).toBe("success");
    expect(res.body.excel.status).toBe("success");
    const [run] = await query("SELECT * FROM backup_runs");
    expect(run.status).toBe("success");
    expect(run.sql_key).toMatch(/^ramadan-backups\/\d{4}-\d{2}-\d{2}\/.+-database\.sql\.gz$/);
    expect(run.excel_key).toMatch(/^ramadan-backups\/\d{4}-\d{2}-\d{2}\/.+-snapshot\.xlsx$/);
    expect(await storage.headSize(run.sql_key)).toBe(Number(run.sql_size));
    expect(await storage.headSize(run.excel_key)).toBe(Number(run.excel_size));
    expect(run.completed_at).toBeTruthy();
  });

  it("produit un SQL restaurable fidèle (schéma, contraintes, données)", async () => {
    await seed();
    await query("INSERT INTO users (username, password_hash, role) VALUES ('adminrestore', '$2a$12$abcdefghijklmnopqrstuv', 'admin')");
    await query("INSERT INTO sessions (token_hash, user_id, csrf_token, expires_at) SELECT REPEAT('a', 64), id, REPEAT('b', 64), DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 DAY) FROM users LIMIT 1");
    const res = await runBackup();
    expect(res.status).toBe(200);
    const [run] = await query("SELECT sql_key FROM backup_runs");
    const url = await storage.signedDownloadUrl(run.sql_key, "x.sql.gz");
    const bytes = Buffer.from(await (await fetch(url)).arrayBuffer());
    const sql = zlib.gunzipSync(bytes).toString("utf8");
    expect(sql).toContain("CREATE TABLE `families`");
    expect(sql).toContain("FOREIGN KEY");
    expect(sql).toContain("INSERT INTO `family_members`");
    expect(sql).not.toMatch(/INSERT INTO `sessions`/);
    expect(sql).not.toMatch(/INSERT INTO `rate_limits`/);
    expect(sql).not.toContain("rep_key`,");
    const file = path.join(dir, "restore.sql");
    fs.writeFileSync(file, sql);
    execSync("mysql -uroot -e 'DROP DATABASE IF EXISTS rbm_restore; CREATE DATABASE rbm_restore CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'");
    execSync(`mysql -uroot rbm_restore < ${file}`);
    for (const table of ["users", "sponsors", "vendors", "families", "family_members", "distributions", "distribution_assignments"]) {
      const original = (await query(`SELECT COUNT(*) AS c FROM ${table}`))[0].c;
      const restored = Number(execSync(`mysql -uroot -N -e 'SELECT COUNT(*) FROM rbm_restore.${table}'`).toString().trim());
      expect(restored, table).toBe(original);
    }
    const note = execSync(`mysql -uroot -N --default-character-set=utf8mb4 -e "SELECT full_name FROM rbm_restore.sponsors LIMIT 1"`).toString().trim();
    expect(note).toBe("Parrain d'Été \"Test\"");
    const fks = Number(execSync(`mysql -uroot -N -e "SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA='rbm_restore' AND CONSTRAINT_TYPE='FOREIGN KEY'"`).toString().trim());
    expect(fks).toBeGreaterThanOrEqual(10);
    const dupCin = execSync(`mysql -uroot rbm_restore -e "INSERT INTO family_members (family_id, full_name, name_norm, name_key, cin_norm) SELECT family_id, 'x', 'x', 'x', cin_norm FROM family_members WHERE cin_norm IS NOT NULL LIMIT 1" 2>&1 || true`).toString();
    expect(dupCin).toMatch(/Duplicate entry/i);
    execSync("mysql -uroot -e 'DROP DATABASE rbm_restore'");
  });

  it("l'instantané Excel stocké est un classeur valide sans secrets", async () => {
    await seed();
    await query("INSERT INTO users (username, password_hash, role) VALUES ('adm', '$2a$12$donotleakthishash', 'admin')");
    await runBackup();
    const [run] = await query("SELECT excel_key FROM backup_runs");
    const bytes = Buffer.from(await (await fetch(await storage.signedDownloadUrl(run.excel_key, "x.xlsx"))).arrayBuffer());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes);
    expect(wb.getWorksheet("Familles").rowCount).toBe(6);
    expect(wb.getWorksheet("Attributions").rowCount).toBe(6);
    expect(bytes.toString("latin1")).not.toContain("donotleak");
  });

  it("ne crée pas de doublon si une sauvegarde réussie existe déjà pour la date", async () => {
    await seed();
    const first = await runBackup();
    expect(first.body.status).toBe("success");
    const second = await runBackup();
    expect(second.status).toBe(200);
    expect(second.body.status).toBe("already_completed");
    expect((await query("SELECT COUNT(*) AS c FROM backup_runs"))[0].c).toBe(1);
  });

  it("gère les invocations concurrentes sans doublon", async () => {
    await seed();
    const results = await Promise.all([runBackup(), runBackup(), runBackup()]);
    const statuses = results.map((r) => r.body.status).sort();
    expect(statuses.filter((s) => s === "success")).toHaveLength(1);
    expect(statuses.every((s) => ["success", "in_progress", "already_completed"].includes(s))).toBe(true);
    expect((await query("SELECT COUNT(*) AS c FROM backup_runs WHERE status = 'success'"))[0].c).toBe(1);
    expect((await query("SELECT COUNT(*) AS c FROM backup_runs"))[0].c).toBe(1);
  });

  it("reprend une exécution abandonnée après le délai de péremption", async () => {
    await seed();
    await query("INSERT INTO backup_runs (operational_date, execution_id, status, started_at) VALUES (?, UUID(), 'running', DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 MINUTE))", [D.todayCasablanca()]);
    const res = await runBackup();
    expect(res.body.status).toBe("success");
    const statuses = (await query("SELECT status FROM backup_runs ORDER BY id")).map((r) => r.status);
    expect(statuses).toEqual(["failed", "success"]);
  });

  it("renvoie in_progress pour une exécution récente encore en cours", async () => {
    await query("INSERT INTO backup_runs (operational_date, execution_id, status) VALUES (?, UUID(), 'running')", [D.todayCasablanca()]);
    const res = await runBackup();
    expect(res.status).toBe(409);
    expect(res.body.status).toBe("in_progress");
  });

  it("enregistre l'échec et renvoie une erreur actionnable quand le stockage n'est pas configuré", async () => {
    delete process.env.BACKUP_STORAGE_BUCKET;
    const res = await runBackup();
    expect(res.status).toBe(500);
    expect(res.body.status).toBe("failed");
    expect(res.body.message).toMatch(/BACKUP_STORAGE_BUCKET/);
    const [run] = await query("SELECT * FROM backup_runs");
    expect(run.status).toBe("failed");
    expect(run.sql_status).toBe("failed");
    expect(run.excel_status).toBe("failed");
  });

  it("marque l'échec si le stockage est injoignable puis permet une nouvelle tentative", async () => {
    await seed();
    configureStorage("http://127.0.0.1:1");
    const failed = await runBackup();
    expect(failed.status).toBe(500);
    expect(failed.body.status).toBe("failed");
    expect((await query("SELECT status FROM backup_runs"))[0].status).toBe("failed");
    configureStorage();
    const retry = await runBackup();
    expect(retry.status).toBe(200);
    expect(retry.body.status).toBe("success");
    expect((await query("SELECT status FROM backup_runs ORDER BY id")).map((r) => r.status)).toEqual(["failed", "success"]);
  });

  it("signale une sauvegarde partielle si l'export Excel échoue, sans marquer le succès", async () => {
    await seed();
    vi.spyOn(excelModule, "buildSnapshotWorkbook").mockRejectedValue(new Error("échec simulé de génération Excel password=hunter2"));
    const res = await runBackup();
    expect(res.status).toBe(500);
    expect(res.body.status).toBe("partial");
    expect(res.body.sql.status).toBe("success");
    expect(res.body.excel.status).toBe("failed");
    const [run] = await query("SELECT * FROM backup_runs");
    expect(run.status).toBe("partial");
    expect(run.excel_key).toBeNull();
    expect(run.error_message).not.toContain("hunter2");
    vi.restoreAllMocks();
    const retry = await runBackup();
    expect(retry.body.status).toBe("success");
  });

  it("signale une sauvegarde partielle si le SQL échoue", async () => {
    await seed();
    vi.spyOn(sqlDumpModule, "openDumpStream").mockRejectedValue(new Error("échec simulé du dump"));
    const res = await runBackup();
    expect(res.body.status).toBe("partial");
    expect(res.body.sql.status).toBe("failed");
    expect(res.body.excel.status).toBe("success");
    const [run] = await query("SELECT * FROM backup_runs");
    expect(run.sql_key).toBeNull();
    expect(run.sql_status).toBe("failed");
  });

  it("échoue proprement si les deux artefacts échouent", async () => {
    vi.spyOn(sqlDumpModule, "openDumpStream").mockRejectedValue(new Error("sql"));
    vi.spyOn(excelModule, "buildSnapshotWorkbook").mockRejectedValue(new Error("excel"));
    const res = await runBackup();
    expect(res.status).toBe(500);
    expect(res.body.status).toBe("failed");
  });

  it("renvoie une erreur générique en cas de panne de base de données", async () => {
    await query("RENAME TABLE backup_runs TO backup_runs_off");
    try {
      const res = await runBackup();
      expect(res.status).toBe(500);
      expect(JSON.stringify(res.body)).not.toMatch(/backup_runs|ER_/);
    } finally {
      await query("RENAME TABLE backup_runs_off TO backup_runs");
    }
  });

  it("traite un volume important sans charger toute la base en mémoire", async () => {
    const pool = getPool();
    await pool.query("SET FOREIGN_KEY_CHECKS = 0");
    const batch = 2000;
    for (let b = 0; b < 10; b++) {
      const fam = [];
      for (let i = 0; i < batch; i++) fam.push([`06${String(10000000 + b * batch + i)}`]);
      const r = await query("INSERT INTO families (phone_norm) VALUES ?", [fam]);
      const mem = [];
      for (let i = 0; i < batch; i++) {
        const n = b * batch + i;
        mem.push([r.insertId + i, `Personne Volume ${n}`, `personne volume ${n}`, "prsn vlm", `VX${String(100000 + n)}`, `VX${String(100000 + n)}`, 1]);
      }
      await query("INSERT INTO family_members (family_id, full_name, name_norm, name_key, cin, cin_norm, is_representative) VALUES ?", [mem]);
    }
    await pool.query("SET FOREIGN_KEY_CHECKS = 1");
    const before = process.memoryUsage().heapUsed;
    const res = await runBackup();
    expect(res.body.status).toBe("success");
    const [run] = await query("SELECT sql_size, excel_size FROM backup_runs");
    expect(Number(run.sql_size)).toBeGreaterThan(100000);
    expect(process.memoryUsage().heapUsed - before).toBeLessThan(600 * 1024 * 1024);
  });
});

describe("interface administrateur des sauvegardes", () => {
  it("liste les exécutions pour un administrateur uniquement", async () => {
    await seed();
    await runBackup();
    const admin = await adminSession();
    const ok = await call(list, { session: admin });
    expect(ok.status).toBe(200);
    expect(ok.body.items).toHaveLength(1);
    expect(ok.body.items[0]).toMatchObject({ status: "success", hasSql: true, hasExcel: true });
    expect(JSON.stringify(ok.body)).not.toMatch(/ramadan-backups\//);
    expect((await call(list)).status).toBe(401);
    expect((await call(list, { session: await userSession() })).status).toBe(403);
  });

  it("refuse les téléchargements non autorisés", async () => {
    await seed();
    await runBackup();
    const [{ id }] = await query("SELECT id FROM backup_runs");
    expect((await call(download, { query: { id: String(id), type: "excel" } })).status).toBe(401);
    expect((await call(download, { session: await userSession(), query: { id: String(id), type: "excel" } })).status).toBe(403);
  });

  it("fournit une URL signée courte pour l'instantané Excel et le SQL existant", async () => {
    await seed();
    await runBackup();
    const [{ id }] = await query("SELECT id FROM backup_runs");
    const admin = await adminSession();
    const excel = await call(download, { session: admin, query: { id: String(id), type: "excel" } });
    expect(excel.status).toBe(200);
    expect(excel.body.expiresInSeconds).toBe(60);
    expect(excel.body.url).toMatch(/X-Amz-Expires=60/);
    const bytes = Buffer.from(await (await fetch(excel.body.url)).arrayBuffer());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes);
    expect(wb.getWorksheet("Familles")).toBeTruthy();
    const sql = await call(download, { session: admin, query: { id: String(id), type: "sql" } });
    expect(sql.status).toBe(200);
    expect(zlib.gunzipSync(Buffer.from(await (await fetch(sql.body.url)).arrayBuffer())).toString()).toContain("CREATE TABLE");
  });

  it("ne propose le SQL que s'il existe réellement et refuse les paramètres arbitraires", async () => {
    await seed();
    vi.spyOn(sqlDumpModule, "openDumpStream").mockRejectedValue(new Error("sql"));
    await runBackup();
    const [{ id }] = await query("SELECT id FROM backup_runs");
    const admin = await adminSession();
    expect((await call(download, { session: admin, query: { id: String(id), type: "sql" } })).status).toBe(404);
    expect((await call(download, { session: admin, query: { id: String(id), type: "excel" } })).status).toBe(200);
    expect((await call(download, { session: admin, query: { id: String(id), type: "../../secret" } })).status).toBe(400);
    expect((await call(download, { session: admin, query: { id: "99999", type: "excel" } })).status).toBe(404);
    expect((await call(download, { session: admin, query: { id: "abc", type: "excel" } })).status).toBe(400);
  });

  it("permet à un administrateur de relancer une sauvegarde manuellement", async () => {
    await seed();
    const admin = await adminSession();
    expect((await call(manualRun, { method: "POST", session: await userSession() })).status).toBe(403);
    const res = await call(manualRun, { method: "POST", session: admin });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    const again = await call(manualRun, { method: "POST", session: admin });
    expect(again.body.status).toBe("already_completed");
  });
});
