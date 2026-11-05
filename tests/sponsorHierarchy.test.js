import { describe, it, expect, beforeEach, afterAll } from "vitest";
import ExcelJS from "exceljs";
import { resetDb, query, call, userSession, mkVendor, mkFamily } from "./helpers";
const { createSponsor, updateSponsor, listSponsors } = require("../lib/entities");
const { createFamily, updateFamily, listFamilies, parseFamilyFilters } = require("../lib/families");
const { searchSponsors, searchFamilies } = require("../lib/search");
const { sponsorTree } = require("../lib/sponsorTree");
const D = require("../lib/distributions");
const { allStats, parseStatsFilters } = require("../lib/stats");
const { applySchema } = require("../lib/schema");
const { closePool } = require("../lib/db");

let counter = 0;
const mk = (fullName, type, parentId = null) => {
  counter += 1;
  return createSponsor({ fullName, cin: `TS${String(300000 + counter)}`, phone: "", type, parentId }, null, { force: true });
};
const HEADERS = ["Référence famille", "Rôle", "Nom complet", "CIN", "Téléphone", "Parrain", "Date d'inscription"];
const rows = { page: 1, pageSize: 50, offset: 0 };
const family = (name, sponsorId) => mkFamily(name, sponsorId);
const familyInput = (sponsorId, cin) => ({ representative: { fullName: "Responsable Test", cin, phone: "0612345678" }, members: [], sponsorId });

let S;
let vendor;

beforeEach(async () => {
  await resetDb();
  vendor = await mkVendor("Vendeur Hiérarchie");
  S = {};
  S.super = await mk("Super Horizon", "group");
  S.classicA = await mk("Classique Alpha", "classic", S.super);
  S.classicB = await mk("Classique Bravo", "classic", S.super);
  S.specialX = await mk("Special Xenon", "special", S.super);
  S.subX1 = await mk("Sous Xenon Un", "sub", S.specialX);
  S.subX2 = await mk("Sous Xenon Deux", "sub", S.specialX);
  S.classicC = await mk("Classique Charlie", "classic");
  S.specialY = await mk("Special Yankee", "special");
  S.subY1 = await mk("Sous Yankee Un", "sub", S.specialY);
  S.subY2 = await mk("Sous Yankee Deux", "sub", S.specialY);
});
afterAll(closePool);

describe("scénarios de création valides", () => {
  it("1. un super-parrain avec plusieurs parrains classiques", async () => {
    const { items } = await listSponsors({ q: "", ...rows });
    const kids = items.filter((s) => s.parentId === S.super && s.type === "classic");
    expect(kids.map((k) => k.fullName).sort()).toEqual(["Classique Alpha", "Classique Bravo"]);
    expect(items.find((s) => s.id === S.super)).toMatchObject({ type: "group", canHaveFamilies: false });
  });

  it("2. un super-parrain avec un parrain spécial", async () => {
    const special = (await listSponsors({ q: "", ...rows })).items.find((s) => s.id === S.specialX);
    expect(special).toMatchObject({ type: "special", parentId: S.super, parentName: "Super Horizon", canHaveFamilies: false });
  });

  it("3. des sous-parrains rattachés à un parrain spécial, indépendant ou non", async () => {
    const items = (await listSponsors({ q: "", ...rows })).items;
    expect(items.find((s) => s.id === S.subX1)).toMatchObject({ type: "sub", parentName: "Special Xenon", canHaveFamilies: true });
    expect(items.find((s) => s.id === S.subY1)).toMatchObject({ type: "sub", parentName: "Special Yankee" });
    expect(items.find((s) => s.id === S.specialY).parentId).toBeNull();
    expect(items.find((s) => s.id === S.specialX).subCount).toBe(2);
  });

  it("4. des familles pour un parrain classique, rattaché ou indépendant", async () => {
    await expect(family("Famille Alpha Un", S.classicA)).resolves.toBeTruthy();
    await expect(family("Famille Charlie Un", S.classicC)).resolves.toBeTruthy();
  });

  it("5. des familles pour les sous-parrains d'un parrain spécial", async () => {
    await expect(family("Famille Xenon Un", S.subX1)).resolves.toBeTruthy();
    await expect(family("Famille Yankee Un", S.subY2)).resolves.toBeTruthy();
  });
});

describe("associations interdites bloquées par le backend", () => {
  it("6. refuse les familles directes d'un super-parrain", async () => {
    await expect(createFamily(familyInput(S.super, "AB910001"), null)).rejects.toMatchObject({ status: 400 });
    const count = await query("SELECT COUNT(*) AS c FROM families");
    expect(count[0].c).toBe(0);
  });

  it("6. refuse les familles directes d'un parrain spécial", async () => {
    await expect(createFamily(familyInput(S.specialX, "AB910002"), null)).rejects.toMatchObject({ status: 400 });
    await expect(createFamily(familyInput(S.specialY, "AB910003"), null)).rejects.toMatchObject({ status: 400 });
  });

  it("6. refuse de déplacer une famille existante vers un super-parrain ou un parrain spécial", async () => {
    const id = await family("Famille Mobile", S.classicA);
    const input = familyInput(S.super, "AB920001");
    await expect(updateFamily(id, { ...input, sponsorId: S.super }, null)).rejects.toMatchObject({ status: 400 });
    await expect(updateFamily(id, { ...input, sponsorId: S.specialX }, null)).rejects.toMatchObject({ status: 400 });
    const [row] = await query("SELECT sponsor_id FROM families WHERE id = ?", [id]);
    expect(row.sponsor_id).toBe(S.classicA);
  });

  it("7. refuse les sous-parrains d'un parrain classique", async () => {
    await expect(mk("Faux Sous", "sub", S.classicA)).rejects.toMatchObject({ status: 400 });
  });

  it("refuse toute autre relation hiérarchique invalide", async () => {
    await expect(mk("Sous sans parent", "sub")).rejects.toMatchObject({ status: 400 });
    await expect(mk("Sous sous super", "sub", S.super)).rejects.toMatchObject({ status: 400 });
    await expect(mk("Sous sous sous", "sub", S.subX1)).rejects.toMatchObject({ status: 400 });
    await expect(mk("Super dans super", "group", S.super)).rejects.toMatchObject({ status: 400 });
    await expect(mk("Spécial dans spécial", "special", S.specialX)).rejects.toMatchObject({ status: 400 });
    await expect(mk("Classique dans classique", "classic", S.classicA)).rejects.toMatchObject({ status: 400 });
    await expect(mk("Classique dans sous", "classic", S.subX1)).rejects.toMatchObject({ status: 400 });
    await expect(mk("Parent introuvable", "classic", 999999)).rejects.toMatchObject({ status: 400 });
    await expect(mk("Type invalide", "dieu")).rejects.toMatchObject({ status: 400 });
  });

  it("l'API refuse les mêmes cas, indépendamment de l'interface", async () => {
    const session = await userSession();
    const sponsorsApi = (await import("../pages/api/sponsors/index.js")).default;
    const familiesApi = (await import("../pages/api/families/index.js")).default;
    const bad = await call(sponsorsApi, { method: "POST", session, body: { fullName: "Sous Pirate", cin: "ZZ100001", type: "sub", parentId: S.classicA, force: true } });
    expect(bad.status).toBe(400);
    const direct = await call(familiesApi, { method: "POST", session, body: familyInput(S.specialX, "AB930001") });
    expect(direct.status).toBe(400);
    const directGroup = await call(familiesApi, { method: "POST", session, body: familyInput(S.super, "AB930002") });
    expect(directGroup.status).toBe(400);
    const good = await call(familiesApi, { method: "POST", session, body: familyInput(S.subX1, "AB930003") });
    expect(good.status).toBe(201);
  });

  it("l'API de modification refuse un type incohérent", async () => {
    const session = await userSession();
    const byId = (await import("../pages/api/sponsors/[id].js")).default;
    const res = await call(byId, { method: "PUT", session, query: { id: String(S.classicA) }, body: { fullName: "Classique Alpha", cin: "TS300002", type: "sub", parentId: S.classicB } });
    expect(res.status).toBe(400);
    const [row] = await query("SELECT type, parent_id FROM sponsors WHERE id = ?", [S.classicA]);
    expect(row).toMatchObject({ type: "classic", parent_id: S.super });
  });
});

describe("changement de type sans données incohérentes", () => {
  const edit = (id, name, cin, type, parentId) => updateSponsor(id, { fullName: name, cin, phone: "", type, parentId }, null);

  it("un classique avec familles ne peut devenir ni spécial ni super-parrain", async () => {
    await family("Famille Alpha Un", S.classicA);
    await expect(edit(S.classicA, "Classique Alpha", "TS300002", "special", S.super)).rejects.toMatchObject({ status: 409 });
    await expect(edit(S.classicA, "Classique Alpha", "TS300002", "group", null)).rejects.toMatchObject({ status: 409 });
    const [row] = await query("SELECT type FROM sponsors WHERE id = ?", [S.classicA]);
    expect(row.type).toBe("classic");
  });

  it("un classique avec familles peut devenir sous-parrain d'un spécial", async () => {
    await family("Famille Alpha Un", S.classicA);
    await edit(S.classicA, "Classique Alpha", "TS300002", "sub", S.specialX);
    const [row] = await query("SELECT type, parent_id FROM sponsors WHERE id = ?", [S.classicA]);
    expect(row).toMatchObject({ type: "sub", parent_id: S.specialX });
  });

  it("un classique sans famille peut devenir spécial, puis recevoir des sous-parrains", async () => {
    await edit(S.classicC, "Classique Charlie", "TS300007", "special", null);
    await expect(mk("Nouveau Sous", "sub", S.classicC)).resolves.toBeTruthy();
  });

  it("un spécial qui a des sous-parrains ne peut pas devenir classique, ni sous-parrain", async () => {
    await expect(edit(S.specialX, "Special Xenon", "TS300004", "classic", S.super)).rejects.toMatchObject({ status: 409 });
    await expect(edit(S.specialX, "Special Xenon", "TS300004", "group", null)).rejects.toMatchObject({ status: 409 });
  });

  it("un super-parrain qui a des parrains ne peut pas changer de type", async () => {
    await expect(edit(S.super, "Super Horizon", "TS300001", "classic", null)).rejects.toMatchObject({ status: 409 });
    await expect(edit(S.super, "Super Horizon", "TS300001", "special", null)).rejects.toMatchObject({ status: 409 });
  });

  it("un sous-parrain devenu classique doit quitter son parrain spécial", async () => {
    await expect(edit(S.subX1, "Sous Xenon Un", "TS300005", "classic", S.specialX)).rejects.toMatchObject({ status: 400 });
    await edit(S.subX1, "Sous Xenon Un", "TS300005", "classic", null);
    const [row] = await query("SELECT type, parent_id FROM sponsors WHERE id = ?", [S.subX1]);
    expect(row).toMatchObject({ type: "classic", parent_id: null });
  });

  it("un classique peut être déplacé d'un super-parrain à un autre ou rendu indépendant", async () => {
    const other = await mk("Autre Super", "group");
    await edit(S.classicA, "Classique Alpha", "TS300002", "classic", other);
    await edit(S.classicB, "Classique Bravo", "TS300003", "classic", null);
    const items = (await listSponsors({ q: "", ...rows })).items;
    expect(items.find((s) => s.id === S.classicA).parentName).toBe("Autre Super");
    expect(items.find((s) => s.id === S.classicB).parentId).toBeNull();
  });

  it("refuse de supprimer un parrain qui a des enfants ou des familles", async () => {
    await family("Famille Alpha Un", S.classicA);
    await expect(query("DELETE FROM sponsors WHERE id = ?", [S.super])).rejects.toBeTruthy();
    await expect(query("DELETE FROM sponsors WHERE id = ?", [S.specialX])).rejects.toBeTruthy();
  });

  it("l'API de suppression refuse un parent avec enfants et un parrain avec familles", async () => {
    const session = await userSession();
    const byId = (await import("../pages/api/sponsors/[id].js")).default;
    await family("Famille Alpha Un", S.classicA);
    expect((await call(byId, { method: "DELETE", session, query: { id: String(S.specialX) } })).status).toBe(409);
    expect((await call(byId, { method: "DELETE", session, query: { id: String(S.classicA) } })).status).toBe(409);
    expect((await call(byId, { method: "DELETE", session, query: { id: String(S.classicB) } })).status).toBe(200);
  });
});

describe("arborescence, filtres et statistiques", () => {
  async function seed() {
    const ids = {};
    ids.a1 = await family("Famille Alpha Un", S.classicA);
    ids.a2 = await family("Famille Alpha Deux", S.classicA);
    ids.b1 = await family("Famille Bravo Un", S.classicB);
    ids.b2 = await family("Famille Bravo Deux", S.classicB);
    ids.x1 = await family("Famille Xenon Un", S.subX1);
    ids.x2 = await family("Famille Xenon Deux", S.subX1);
    ids.x3 = await family("Famille Xenon Trois", S.subX2);
    ids.c1 = await family("Famille Charlie Un", S.classicC);
    ids.c2 = await family("Famille Charlie Deux", S.classicC);
    ids.c3 = await family("Famille Charlie Trois", S.classicC);
    ids.y1 = await family("Famille Yankee Un", S.subY1);
    ids.y2 = await family("Famille Yankee Deux", S.subY2);
    await D.createDistribution(
      { date: "2026-03-01", assignments: [ids.a1, ids.b1, ids.b2, ids.x1, ids.x3, ids.c1, ids.y1].map((familyId) => ({ familyId, vendorId: vendor })) },
      null
    );
    return ids;
  }

  it("8. structure A : super-parrain avec parrains classiques", async () => {
    await seed();
    const { byId } = await sponsorTree();
    expect(byId.get(S.classicA)).toMatchObject({ families: 2, benefited: 1, waiting: 1 });
    expect(byId.get(S.classicB)).toMatchObject({ families: 2, benefited: 2, waiting: 0 });
    expect(byId.get(S.super)).toMatchObject({ ownFamilies: 0, families: 7, benefited: 5, waiting: 2, subCount: 3, descendantCount: 5 });
  });

  it("8. structure B : super-parrain avec un parrain spécial et ses sous-parrains", async () => {
    await seed();
    const { byId } = await sponsorTree();
    expect(byId.get(S.subX1)).toMatchObject({ families: 2, benefited: 1 });
    expect(byId.get(S.subX2)).toMatchObject({ families: 1, benefited: 1 });
    expect(byId.get(S.specialX)).toMatchObject({ ownFamilies: 0, families: 3, benefited: 2, waiting: 1, subCount: 2 });
    expect(byId.get(S.subX1).ancestors.map((a) => a.name)).toEqual(["Super Horizon", "Special Xenon"]);
  });

  it("8. structure C : parrain classique indépendant", async () => {
    await seed();
    const { tree, byId } = await sponsorTree();
    expect(tree.some((n) => n.id === S.classicC)).toBe(true);
    expect(byId.get(S.classicC)).toMatchObject({ families: 3, benefited: 1, parentName: null, subCount: 0 });
  });

  it("8. structure D : parrain spécial indépendant", async () => {
    await seed();
    const { tree, byId } = await sponsorTree();
    expect(tree.some((n) => n.id === S.specialY)).toBe(true);
    expect(byId.get(S.specialY)).toMatchObject({ ownFamilies: 0, families: 2, benefited: 1, waiting: 1, subCount: 2 });
  });

  it("les statistiques exposent l'arbre et le total général sans double comptage", async () => {
    await seed();
    const stats = await allStats(parseStatsFilters({}));
    const roots = stats.sponsorTree;
    expect(roots.map((r) => r.name).sort()).toEqual(["Classique Charlie", "Special Yankee", "Super Horizon"]);
    expect(roots.reduce((n, r) => n + r.families, 0)).toBe(12);
    expect(roots.reduce((n, r) => n + r.benefited, 0)).toBe(7);
    expect(stats.global.totalFamilies).toBe(12);
    expect(stats.global.familiesBenefited).toBe(7);
    expect(stats.global.familiesWaiting).toBe(5);
  });

  it("filtrer par super-parrain ou par parrain spécial inclut tous les niveaux", async () => {
    await seed();
    const bySuper = await listFamilies(parseFamilyFilters({ sponsorId: String(S.super) }), rows);
    expect(bySuper.total).toBe(7);
    const bySpecial = await listFamilies(parseFamilyFilters({ sponsorId: String(S.specialX) }), rows);
    expect(bySpecial.total).toBe(3);
    const bySub = await listFamilies(parseFamilyFilters({ sponsorId: String(S.subX2) }), rows);
    expect(bySub.total).toBe(1);
    const found = await searchFamilies("Famille Xenon", { sponsorId: S.super });
    expect(found).toHaveLength(3);
    expect(found.every((f) => f.sponsorParentName === "Special Xenon")).toBe(true);
  });

  it("les statistiques filtrées sur un sous-arbre gardent des totaux exacts", async () => {
    await seed();
    const stats = await allStats(parseStatsFilters({ sponsorId: String(S.specialX) }));
    expect(stats.sponsorTree).toHaveLength(1);
    expect(stats.sponsorTree[0]).toMatchObject({ name: "Special Xenon", families: 3, benefited: 2 });
    expect(stats.global.totalFamilies).toBe(3);
    const vendorTotal = stats.vendors.reduce((n, v) => n + v.families, 0);
    expect(vendorTotal).toBe(2);
  });

  it("les familles éligibles et les attributions exposent le parent direct", async () => {
    const ids = await seed();
    const eligible = await D.eligibleFamilies(parseFamilyFilters({ sponsorId: String(S.super) }));
    expect(eligible.items.every((f) => f.sponsorParentName === "Super Horizon" || f.sponsorParentName === "Special Xenon")).toBe(true);
    const distId = (await query("SELECT id FROM distributions LIMIT 1"))[0].id;
    const detail = await D.getDistribution(distId, {});
    const x = detail.assignments.find((a) => a.familyId === ids.x1);
    expect(x.sponsorParentName).toBe("Special Xenon");
  });

  it("l'API d'arborescence renvoie les trois niveaux", async () => {
    await seed();
    const session = await userSession();
    const treeApi = (await import("../pages/api/sponsors/tree.js")).default;
    const res = await call(treeApi, { session });
    expect(res.status).toBe(200);
    const superNode = res.body.tree.find((n) => n.id === S.super);
    const special = superNode.children.find((n) => n.id === S.specialX);
    expect(special.children.map((c) => c.name).sort()).toEqual(["Sous Xenon Deux", "Sous Xenon Un"]);
    expect(superNode.families).toBe(7);
  });

  it("l'API de recherche filtre les parents possibles selon le type", async () => {
    const session = await userSession();
    const searchApi = (await import("../pages/api/sponsors/search.js")).default;
    const forSub = await call(searchApi, { session, query: { q: "", parentFor: "sub" } });
    expect(forSub.body.items.every((s) => s.type === "special")).toBe(true);
    const forClassic = await call(searchApi, { session, query: { q: "", parentFor: "classic" } });
    expect(forClassic.body.items.every((s) => s.type === "group")).toBe(true);
    const forFamily = await call(searchApi, { session, query: { q: "", familiesOnly: "1" } });
    expect(forFamily.body.items.every((s) => s.canHaveFamilies)).toBe(true);
    const found = await searchSponsors("Special", 10, { parentFor: "sub" });
    expect(found.map((s) => s.id).sort()).toEqual([S.specialX, S.specialY].sort());
  });
});

describe("import et migration", () => {
  it("l'import refuse les parrains qui ne peuvent pas avoir de familles et accepte les autres", async () => {
    const importer = require("../lib/importer");
    const make = async (rowsData) => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Données");
      ws.addRow(HEADERS);
      rowsData.forEach((r) => ws.addRow(r));
      return importer.parseWorkbook(Buffer.from(await wb.xlsx.writeBuffer()));
    };
    const bad = await make([
      ["F1", "Responsable", "Rep Spécial", "AB940001", "0612345678", "Special Xenon", ""],
      ["F2", "Responsable", "Rep Super", "AB940002", "0612345678", "Super Horizon", ""],
      ["F3", "Responsable", "Rep Sous", "AB940003", "0612345678", "Sous Xenon Un", ""],
      ["F4", "Responsable", "Rep Classique", "AB940004", "0612345678", "Classique Alpha", ""]
    ]);
    const v = await importer.validateImport({ rows: bad.rows, mapping: bad.mapping, mode: "add" });
    const flagged = v.errors.filter((e) => e.column === "Parrain").map((e) => e.row).sort();
    expect(flagged).toEqual([2, 3]);
    await expect(importer.commitImport({ rows: bad.rows, mapping: bad.mapping, mode: "add", filename: "x.xlsx" }, null)).rejects.toMatchObject({ status: 422 });
    const families = await query("SELECT COUNT(*) AS c FROM families");
    expect(families[0].c).toBe(0);
    const good = await make([
      ["F3", "Responsable", "Rep Sous", "AB940003", "0612345678", "Sous Xenon Un", ""],
      ["F4", "Responsable", "Rep Classique", "AB940004", "0612345678", "Classique Alpha", ""]
    ]);
    await importer.commitImport({ rows: good.rows, mapping: good.mapping, mode: "add", filename: "ok.xlsx" }, null);
    const owners = await query("SELECT sponsor_id FROM families ORDER BY id");
    expect(owners.map((r) => r.sponsor_id)).toEqual([S.subX1, S.classicA]);
  });

  it("la migration convertit is_group en type sans perdre de données", async () => {
    const { getPool } = require("../lib/db");
    const pool = getPool();
    await pool.query("SET FOREIGN_KEY_CHECKS = 0");
    await pool.query("ALTER TABLE sponsors ADD COLUMN is_group TINYINT(1) NOT NULL DEFAULT 0");
    await pool.query("UPDATE sponsors SET is_group = 1 WHERE id = ?", [S.super]);
    await pool.query("ALTER TABLE sponsors DROP COLUMN type");
    await pool.query("SET FOREIGN_KEY_CHECKS = 1");
    await applySchema();
    const items = await query("SELECT id, type FROM sponsors");
    const byId = new Map(items.map((r) => [r.id, r.type]));
    expect(byId.get(S.super)).toBe("group");
    expect(byId.get(S.classicA)).toBe("classic");
    const cols = await query("SELECT column_name AS name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'sponsors'");
    expect(cols.map((c) => c.name || c.COLUMN_NAME)).not.toContain("is_group");
  });
});
