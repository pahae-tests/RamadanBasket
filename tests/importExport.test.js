import { describe, it, expect, beforeEach, afterAll } from "vitest";
import ExcelJS from "exceljs";
import { resetDb, query, call, adminSession, userSession } from "./helpers";
const { closePool } = require("../lib/db");
const importer = require("../lib/importer");
const { createFamily, parseFamilyFilters } = require("../lib/families");
const { createSponsor, createVendor } = require("../lib/entities");
import { mkSponsor } from "./helpers";
const { buildExport, buildExportFilename, workbookToBuffer, buildSnapshotWorkbook } = require("../lib/excel");
const D = require("../lib/distributions");

const HEADERS = ["Référence famille", "Rôle", "Nom complet", "CIN", "Téléphone", "Parrain", "Date d'inscription"];

async function makeXlsx(rows, headers = HEADERS) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Données");
  ws.addRow(headers);
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function parsed(rows, headers) {
  return importer.parseWorkbook(await makeXlsx(rows, headers));
}

const goodRows = [
  ["F1", "Responsable", "Ahmed Benali", "AB123456", "0612345678", "Mohamed Jabour", "2026-01-10"],
  ["F1", "Membre", "Fatima Benali", "", "", "", ""],
  ["F2", "Responsable", "Hassan Alaoui", "CD654321", "+212700112233", "Mohamed Jabour", "15/01/2026"]
];

let anySponsor;
const fam = (name, cin, extra = {}) => createFamily({ representative: { fullName: name, cin, phone: "0612345678" }, members: extra.members || [], sponsorId: anySponsor }, null);

beforeEach(async () => {
  await resetDb();
  anySponsor = await mkSponsor("Parrain Existant");
});

afterAll(async () => {
  await closePool();
});

describe("import Excel", () => {
  it("analyse un classeur, propose le mapping et préserve les chaînes", async () => {
    const result = await parsed(goodRows);
    expect(result.headers).toEqual(HEADERS);
    expect(result.rows).toHaveLength(3);
    expect(result.mapping.fullName).toBe(2);
    expect(result.mapping.cin).toBe(3);
    expect(result.rows[0].n).toBe(2);
  });

  it("valide et importe un classeur valide", async () => {
    const p = await parsed(goodRows);
    const v = await importer.validateImport({ rows: p.rows, mapping: p.mapping, mode: "add" });
    expect(v.errors).toEqual([]);
    expect(v.summary.families).toBe(2);
    expect(v.summary.members).toBe(3);
    const done = await importer.commitImport({ rows: p.rows, mapping: p.mapping, mode: "add", filename: "test.xlsx" }, null);
    expect(done.families).toBe(2);
    expect((await query("SELECT COUNT(*) AS c FROM families"))[0].c).toBe(2);
    expect((await query("SELECT COUNT(*) AS c FROM family_members"))[0].c).toBe(3);
    expect((await query("SELECT COUNT(*) AS c FROM sponsors"))[0].c).toBe(2);
    const [rep] = await query("SELECT cin, phone FROM family_members WHERE full_name = 'Hassan Alaoui'");
    expect(rep.cin).toBe("CD654321");
    expect(rep.phone).toBe("0700112233");
    const [fam] = await query("SELECT created_at FROM families ORDER BY id LIMIT 1");
    expect(String(fam.created_at)).toMatch(/^2026-01-10/);
    expect((await query("SELECT status FROM import_sessions"))[0].status).toBe("imported");
  });

  it("rejette un classeur dont la colonne obligatoire est absente", async () => {
    const p = await parsed([["x", "y"]], ["Colonne A", "Colonne B"]);
    expect(p.mapping.fullName).toBeNull();
    await expect(importer.validateImport({ rows: p.rows, mapping: p.mapping, mode: "add" })).rejects.toMatchObject({ status: 400 });
  });

  it("détecte valeurs manquantes, formats invalides et dates invalides avec numéros de ligne", async () => {
    const p = await parsed([
      ["F1", "Responsable", "", "XX", "123", "", "31/02/2026"],
      ["F2", "Chef inconnu", "Nom Valide", "", "", "", ""]
    ]);
    const v = await importer.validateImport({ rows: p.rows, mapping: p.mapping, mode: "add" });
    const cols = v.errors.map((e) => `${e.row}:${e.column}`);
    expect(cols).toEqual(expect.arrayContaining(["2:Nom complet", "2:CIN", "2:Téléphone", "2:Date d'inscription", "3:Rôle"]));
    expect(v.errors.find((e) => e.column === "Rôle").suggestion).toBe("Responsable");
    expect(v.errors.find((e) => e.column === "CIN").value).toBe("XX");
  });

  it("détecte les CIN en double dans le fichier en listant toutes les lignes", async () => {
    const rows = [
      ["F1", "Responsable", "Un Un", "AB111111", "", "P"],
      ["F2", "Responsable", "Deux Deux", "CD222222", "", "P"],
      ["F3", "Responsable", "Trois Trois", "ab 111111", "", "P"],
      ["F4", "Responsable", "Quatre Quatre", "AB111111", "", "P"]
    ];
    const p = await parsed(rows, HEADERS.slice(0, 6));
    const v = await importer.validateImport({ rows: p.rows, mapping: p.mapping, mode: "add" });
    const dups = v.errors.filter((e) => /double/.test(e.message));
    expect(dups.map((e) => e.row).sort()).toEqual([2, 4, 5]);
    expect(dups[0].message).toContain("2, 4, 5");
  });

  it("détecte les CIN déjà présents en base et identifie l'enregistrement", async () => {
    await fam("Existant Famille", "AB123456");
    const p = await parsed(goodRows);
    const v = await importer.validateImport({ rows: p.rows, mapping: p.mapping, mode: "add" });
    const e = v.errors.find((x) => x.column === "CIN");
    expect(e.row).toBe(2);
    expect(e.message).toMatch(/Existant Famille/);
    expect(e.message).toMatch(/famille n°/);
  });

  it("détecte un CIN de membre en conflit avec la base", async () => {
    await fam("Existant Famille", "ZZ000001");
    const p = await parsed([
      ["F1", "Responsable", "Chef Famille", "AB100000", "", "P"],
      ["F1", "Membre", "Membre Famille", "ZZ000001", "", ""]
    ], HEADERS.slice(0, 6));
    const v = await importer.validateImport({ rows: p.rows, mapping: p.mapping, mode: "add" });
    expect(v.errors.map((e) => e.row)).toEqual([3]);
  });

  it("détecte les références orphelines et les familles sans ou avec plusieurs responsables", async () => {
    const p = await parsed([
      ["F1", "Membre", "Orphelin Un", "", "", ""],
      ["F2", "Responsable", "Chef Un", "AB100001", "", "P"],
      ["F2", "Responsable", "Chef Deux", "AB100002", "", "P"]
    ], HEADERS.slice(0, 6));
    const v = await importer.validateImport({ rows: p.rows, mapping: p.mapping, mode: "add" });
    expect(v.errors.some((e) => e.row === 2 && /aucun Responsable/.test(e.message))).toBe(true);
    expect(v.errors.filter((e) => /plusieurs Responsables/.test(e.message)).map((e) => e.row).sort()).toEqual([3, 4]);
  });

  it("suggère un parrain proche sans le fusionner", async () => {
    await createSponsor({ fullName: "Mohamed Jabour" }, null);
    const p = await parsed([["F1", "Responsable", "Ahmed Benali", "AB123456", "0612345678", "Mhmed Jbor"]], HEADERS.slice(0, 6));
    const v = await importer.validateImport({ rows: p.rows, mapping: p.mapping, mode: "add" });
    expect(v.errors).toEqual([]);
    expect(v.warnings[0].suggestion).toBe("Mohamed Jabour");
    await importer.commitImport({ rows: p.rows, mapping: p.mapping, mode: "add" }, null);
    expect((await query("SELECT COUNT(*) AS c FROM sponsors"))[0].c).toBe(3);
  });

  it("réutilise un parrain existant correspondant exactement", async () => {
    await createSponsor({ fullName: "Mohamed Jabour" }, null);
    const p = await parsed(goodRows);
    await importer.commitImport({ rows: p.rows, mapping: p.mapping, mode: "add" }, null);
    expect((await query("SELECT COUNT(*) AS c FROM sponsors"))[0].c).toBe(2);
  });

  it("permet la correction en ligne puis la revalidation", async () => {
    const p = await parsed([["F1", "Responsable", "Ahmed Benali", "BAD", "0612345678", "P"]], HEADERS.slice(0, 6));
    let v = await importer.validateImport({ rows: p.rows, mapping: p.mapping, mode: "add" });
    expect(v.errors).toHaveLength(1);
    await expect(importer.commitImport({ rows: p.rows, mapping: p.mapping, mode: "add" }, null)).rejects.toMatchObject({ status: 422 });
    expect((await query("SELECT COUNT(*) AS c FROM families"))[0].c).toBe(0);
    const corrected = p.rows.map((r) => ({ ...r, v: r.v.map((cell, i) => (i === 3 ? "AB123456" : cell)) }));
    v = await importer.validateImport({ rows: corrected, mapping: p.mapping, mode: "add" });
    expect(v.errors).toEqual([]);
    await importer.commitImport({ rows: corrected, mapping: p.mapping, mode: "add" }, null);
    expect((await query("SELECT COUNT(*) AS c FROM families"))[0].c).toBe(1);
  });

  it("ne modifie rien si des erreurs bloquantes subsistent", async () => {
    await fam("Déjà Là", "ZZ000009");
    const p = await parsed([
      ["F1", "Responsable", "Valide Un", "AB100001", "", "P"],
      ["F2", "Responsable", "Invalide", "ZZ000009", "", "P"]
    ], HEADERS.slice(0, 6));
    await expect(importer.commitImport({ rows: p.rows, mapping: p.mapping, mode: "add" }, null)).rejects.toMatchObject({ status: 422 });
    expect((await query("SELECT COUNT(*) AS c FROM families"))[0].c).toBe(1);
    expect((await query("SELECT status, error_count FROM import_sessions"))[0]).toMatchObject({ status: "rejected", error_count: 1 });
    expect((await query("SELECT COUNT(*) AS c FROM import_errors"))[0].c).toBe(1);
  });

  it("n'importe rien en cas d'échec inattendu au milieu de la transaction", async () => {
    await fam("Existant Intact", "ZZ000010");
    await query("DROP TRIGGER IF EXISTS fail_member");
    await query("CREATE TRIGGER fail_member BEFORE INSERT ON family_members FOR EACH ROW BEGIN IF NEW.full_name = 'Explosion Test' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'boom'; END IF; END");
    const p = await parsed([
      ["F1", "Responsable", "Avant Explosion", "AB100002", "", "P"],
      ["F2", "Responsable", "Explosion Test", "AB100003", "", "P"]
    ], HEADERS.slice(0, 6));
    try {
      await expect(importer.commitImport({ rows: p.rows, mapping: p.mapping, mode: "add" }, null)).rejects.toBeTruthy();
      await expect(importer.commitImport({ rows: p.rows, mapping: p.mapping, mode: "replace" }, null)).rejects.toBeTruthy();
    } finally {
      await query("DROP TRIGGER IF EXISTS fail_member");
    }
    expect((await query("SELECT COUNT(*) AS c FROM families"))[0].c).toBe(1);
    expect((await query("SELECT full_name FROM family_members"))[0].full_name).toBe("Existant Intact");
  });

  it("remplace les familles en conservant vendeurs, distributions et historique", async () => {
    const f = await fam("Ancienne Famille", "ZZ000011");
    const vendor = await createVendor({ name: "Vendeur Conservé" }, null);
    const dist = await D.createDistribution({ date: "2026-03-01", assignments: [{ familyId: f, vendorId: vendor }] }, null);
    const p = await parsed(goodRows);
    const res = await importer.commitImport({ rows: p.rows, mapping: p.mapping, mode: "replace" }, null);
    expect(res.families).toBe(2);
    expect((await query("SELECT COUNT(*) AS c FROM families"))[0].c).toBe(2);
    expect((await query("SELECT COUNT(*) AS c FROM vendors"))[0].c).toBe(1);
    const d = await D.getDistribution(dist);
    expect(d.assignments[0].familyName).toBe("Ancienne Famille");
    expect(d.assignments[0].familyId).toBeNull();
  });

  it("ignore les formules : seul le résultat texte est lu", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Données");
    ws.addRow(["Nom complet", "CIN"]);
    ws.addRow([{ formula: "1+1", result: undefined }, "AB123456"]);
    ws.addRow([{ formula: 'HYPERLINK("http://evil","x")', result: "Nom Calculé" }, "CD123456"]);
    const p = await importer.parseWorkbook(Buffer.from(await wb.xlsx.writeBuffer()));
    expect(p.rows[0].v[0]).toBe("");
    expect(p.rows[1].v[0]).toBe("Nom Calculé");
  });

  it("limite la taille de l'import", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Données");
    ws.addRow(["Nom complet"]);
    for (let i = 0; i < importer.MAX_ROWS + 1; i++) ws.addRow([`Personne ${i}`]);
    await expect(importer.parseWorkbook(Buffer.from(await wb.xlsx.writeBuffer()))).rejects.toMatchObject({ status: 400 });
  });

  it("génère un rapport d'erreurs .xlsx", async () => {
    const wb = importer.errorReportWorkbook([{ row: 5, column: "CIN", value: "BAD", message: "Format invalide", suggestion: null, severity: "error" }], []);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const check = new ExcelJS.Workbook();
    await check.xlsx.load(buf);
    expect(check.worksheets[0].getRow(2).getCell(1).value).toBe(5);
    expect(check.worksheets[0].getRow(2).getCell(3).value).toBe("BAD");
  });

  it("exige la phrase de confirmation pour le mode remplacement via l'API", async () => {
    const commit = (await import("../pages/api/admin/import/commit.js")).default;
    const session = await adminSession();
    const p = await parsed(goodRows);
    const refused = await call(commit, { method: "POST", session, body: { rows: p.rows, mapping: p.mapping, mode: "replace", confirmation: "oui" } });
    expect(refused.status).toBe(400);
    const accepted = await call(commit, { method: "POST", session, body: { rows: p.rows, mapping: p.mapping, mode: "replace", confirmation: "REMPLACER" } });
    expect(accepted.status).toBe(200);
    const standard = await userSession();
    expect((await call(commit, { method: "POST", session: standard, body: {} })).status).toBe(403);
  });

  it("génère le modèle Excel", async () => {
    const buf = Buffer.from(await importer.templateWorkbook().xlsx.writeBuffer());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    expect(wb.worksheets[0].getRow(1).getCell(3).value).toBe("Nom complet");
  });
});

async function readExport(type, q = {}) {
  const wb = await buildExport(type, q);
  const buf = await workbookToBuffer(wb);
  const out = new ExcelJS.Workbook();
  await out.xlsx.load(buf);
  return out;
}

describe("export Excel", () => {
  let sponsorA;
  let sponsorB;
  let famA;

  beforeEach(async () => {
    sponsorA = await createSponsor({ fullName: "Parrain Alpha", cin: "PA111111", phone: "0611234567" }, null);
    sponsorB = await createSponsor({ fullName: "Bouknitir", cin: "PB222222" }, null);
    famA = await createFamily({ representative: { fullName: "Famille Alpha Un", cin: "AB000123", phone: "0661234512" }, sponsorId: sponsorA, members: [{ fullName: "Membre Alpha", phone: "0661234512" }] }, null);
    await createFamily({ representative: { fullName: "Famille Bravo Un", cin: "CD000456", phone: "0771234534" }, sponsorId: sponsorB, members: [] }, null);
  });

  it("exporte toutes les familles avec en-têtes en français, gel de ligne et filtres automatiques", async () => {
    const wb = await readExport("families");
    const ws = wb.getWorksheet("Familles");
    expect(ws.rowCount).toBe(3);
    expect(ws.getRow(1).getCell(2).value).toBe("Responsable");
    expect(ws.getRow(1).font.bold).toBe(true);
    expect(ws.views[0].state).toBe("frozen");
    expect(ws.autoFilter).toBeTruthy();
  });

  it("affiche les membres dans l'export des familles", async () => {
    const ws = (await readExport("families")).getWorksheet("Familles");
    const row = [2, 3].map((r) => ws.getRow(r)).find((r) => r.getCell(2).value === "Famille Alpha Un");
    expect(row.getCell(6).value).toContain("Membre Alpha");
  });

  it("conserve CIN et téléphones comme chaînes, y compris les zéros initiaux", async () => {
    const ws = (await readExport("families")).getWorksheet("Familles");
    const rows = [2, 3].map((r) => ({ cin: ws.getRow(r).getCell(3).value, phone: ws.getRow(r).getCell(4).value }));
    for (const r of rows) {
      expect(typeof r.cin).toBe("string");
      expect(typeof r.phone).toBe("string");
    }
    expect(rows.map((r) => r.phone).sort()).toEqual(["0661234512", "0771234534"]);
    expect(rows.map((r) => r.cin).sort()).toEqual(["AB000123", "CD000456"]);
  });

  it("respecte les filtres actifs", async () => {
    const wb = await readExport("families", { sponsorId: String(sponsorA) });
    expect(wb.getWorksheet("Familles").rowCount).toBe(2);
    expect(wb.getWorksheet("Familles").getRow(2).getCell(2).value).toBe("Famille Alpha Un");
    const none = await readExport("families", { q: "zzzzqqqq" });
    expect(none.getWorksheet("Familles").rowCount).toBe(1);
  });

  it("exporte membres, parrains, vendeurs, distributions, bénéficiaires et en attente", async () => {
    const vendor = await createVendor({ name: "Vendeur Export", phone: "0698765432" }, null);
    const dist = await D.createDistribution({ date: "2026-03-01", assignments: [{ familyId: famA, vendorId: vendor }] }, null);
    expect(dist).toBeGreaterThan(0);
    expect((await readExport("members")).getWorksheet("Membres").rowCount).toBe(4);
    expect((await readExport("sponsors")).getWorksheet("Parrains").rowCount).toBe(4);
    expect((await readExport("vendors")).getWorksheet("Vendeurs").rowCount).toBe(2);
    expect((await readExport("distributions")).getWorksheet("Distributions").rowCount).toBe(2);
    expect((await readExport("benefited")).getWorksheet("Bénéficiaires").rowCount).toBe(2);
    expect((await readExport("waiting")).getWorksheet("En attente").rowCount).toBe(2);
    const stats = await readExport("statistics");
    expect(stats.worksheets.map((w) => w.name)).toEqual(["Synthèse", "Parrains", "Vendeurs", "Jours"]);
  });

  it("nomme le fichier selon les filtres", async () => {
    expect(await buildExportFilename("families", {}, "2026-10-11")).toBe("familles_11102026.xlsx");
    expect(await buildExportFilename("families", { sponsorId: String(sponsorB), benefited: "yes" }, "2026-10-11")).toBe("familles_11102026_bouknitir_beneficie.xlsx");
    expect(await buildExportFilename("families", { benefited: "no" }, "2026-10-11")).toBe("familles_11102026_non-beneficie.xlsx");
    expect(await buildExportFilename("benefited", { sponsorId: String(sponsorB) }, "2026-10-11")).toBe("familles_11102026_bouknitir_beneficie.xlsx");
    expect(await buildExportFilename("sponsors", {}, "2026-10-11")).toBe("parrains_11102026.xlsx");
  });

  it("renvoie le nom de fichier dans l'en-tête de l'API d'export", async () => {
    const handler = (await import("../pages/api/exports/[type].js")).default;
    const session = await userSession();
    const res = await call(handler, { session, query: { type: "families", sponsorId: String(sponsorB), benefited: "yes" } });
    expect(res.status).toBe(200);
    expect(String(res.headers["content-disposition"])).toMatch(/familles_\d{8}_bouknitir_beneficie\.xlsx/);
  });

  it("n'exporte jamais de secrets dans l'instantané de sauvegarde", async () => {
    await query("INSERT INTO users (username, password_hash, role) VALUES ('adm', '$2a$12$secrethashsecrethashsecrethash', 'admin')");
    const wb = await buildSnapshotWorkbook();
    const buf = await workbookToBuffer(wb);
    expect(buf.toString("latin1")).not.toContain("secrethash");
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Familles", "Membres", "Parrains", "Vendeurs", "Distributions", "Attributions"]);
    expect(await readExport("unknown").catch((e) => e.status)).toBe(400);
  });

  it("gère un volume important", async () => {
    const rows = [];
    for (let i = 0; i < 1500; i++) rows.push([`06${String(10000000 + i)}`]);
    for (let i = 0; i < rows.length; i += 300) {
      const chunk = rows.slice(i, i + 300);
      await query("INSERT INTO families (sponsor_id, phone, phone_norm) VALUES ?", [chunk.map((r) => [sponsorA, r[0], r[0]])]);
    }
    const wb = await readExport("families");
    expect(wb.getWorksheet("Familles").rowCount).toBe(1500 + 2 + 1);
  });
});
