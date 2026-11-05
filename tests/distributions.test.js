import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, query, mkSponsor, mkVendor, mkFamily } from "./helpers";
const { parseFamilyFilters, listFamilies, getFamily, deleteFamily } = require("../lib/families");
const { updateVendor } = require("../lib/entities");
const D = require("../lib/distributions");
const { allStats, parseStatsFilters } = require("../lib/stats");
const { closePool } = require("../lib/db");

let families = [];
let sponsorId;
let vendorA;
let vendorB;

beforeEach(async () => {
  await resetDb();
  sponsorId = await mkSponsor("Parrain Distribution");
  families = [];
  for (let i = 0; i < 10; i++) families.push(await mkFamily(`Famille Numéro ${i + 1}`, sponsorId));
  vendorA = await mkVendor("Vendeur Alpha");
  vendorB = await mkVendor("Vendeur Bravo");
});
afterAll(closePool);

const plan = (ids, a = vendorA, b = vendorB) => ids.map((id, i) => ({ familyId: id, vendorId: i % 2 === 0 ? a : b }));

describe("sélection des familles", () => {
  it("ne liste que les familles jamais servies", async () => {
    await D.createDistribution({ date: "2026-03-01", assignments: plan(families.slice(0, 4)) }, null);
    const result = await D.eligibleFamilies(parseFamilyFilters({}));
    expect(result.total).toBe(6);
    expect(result.items.map((f) => f.id)).not.toContain(families[0]);
  });

  it("choisit automatiquement les plus anciennes inscrites", async () => {
    const r = await D.autoSelect(4, parseFamilyFilters({}));
    expect(r.selected).toBe(4);
    expect(r.shortfall).toBe(0);
    expect(r.items.map((i) => i.id)).toEqual(families.slice(0, 4));
  });

  it("exclut les familles déjà choisies et signale le manque", async () => {
    const r = await D.autoSelect(25, parseFamilyFilters({}), families.slice(0, 2));
    expect(r.selected).toBe(8);
    expect(r.shortfall).toBe(17);
  });

  it("rejette un nombre invalide", async () => {
    await expect(D.autoSelect(0, parseFamilyFilters({}))).rejects.toMatchObject({ status: 400 });
    await expect(D.autoSelect(NaN, parseFamilyFilters({}))).rejects.toMatchObject({ status: 400 });
  });

  it("cherche intelligemment parmi les familles éligibles", async () => {
    const other = await mkFamily("Mohamed Alaoui", sponsorId);
    const r = await D.eligibleFamilies(parseFamilyFilters({}), { q: "Moahmd" });
    expect(r.items.map((f) => f.id)).toEqual([other]);
  });
});

describe("répartition", () => {
  it("répartit de façon équilibrée sans perdre de famille", () => {
    expect(D.balancedAllocation(10, [1, 2, 3])).toEqual({ 1: 4, 2: 3, 3: 3 });
    expect(Object.values(D.balancedAllocation(7, [1, 2])).reduce((a, b) => a + b, 0)).toBe(7);
  });

  it("accepte une allocation exacte et rejette les écarts", () => {
    expect(D.planAssignments([1, 2, 3], { 10: 2, 11: 1 })).toHaveLength(3);
    expect(() => D.planAssignments([1, 2, 3], { 10: 1 })).toThrow(/Sous-allocation/);
    expect(() => D.planAssignments([1, 2, 3], { 10: 5 })).toThrow(/Sur-allocation/);
  });
});

describe("création d'une distribution", () => {
  it("enregistre chaque attribution avec un instantané", async () => {
    const id = await D.createDistribution({ date: "2026-03-01", assignments: plan(families.slice(0, 4)) }, null);
    const d = await D.getDistribution(id);
    expect(d.families).toBe(4);
    expect(d.vendors.map((v) => v.families).sort()).toEqual([2, 2]);
    expect(d.assignments[0]).not.toHaveProperty("status");
    expect(d.assignments.every((a) => a.familyName && a.sponsorName === "Parrain Distribution")).toBe(true);
  });

  it("autorise plusieurs distributions à la même date", async () => {
    const a = await D.createDistribution({ date: "2026-03-01", assignments: plan(families.slice(0, 3)) }, null);
    const b = await D.createDistribution({ date: "2026-03-01", assignments: plan(families.slice(3, 6)) }, null);
    expect(a).not.toBe(b);
    const list = await D.listDistributions({ pageSize: 10, offset: 0 });
    expect(list.items.filter((d) => String(d.date).slice(0, 10) === "2026-03-01" || d.date).length).toBe(2);
  });

  it("interdit de servir deux fois la même famille, même un autre jour", async () => {
    await D.createDistribution({ date: "2026-03-01", assignments: plan(families.slice(0, 3)) }, null);
    await expect(D.createDistribution({ date: "2026-03-02", assignments: plan(families.slice(2, 5)) }, null)).rejects.toMatchObject({ status: 409 });
    const [{ c }] = await query("SELECT COUNT(*) AS c FROM distribution_assignments");
    expect(c).toBe(3);
    const [{ d }] = await query("SELECT COUNT(*) AS d FROM distributions");
    expect(d).toBe(1);
  });

  it("garantit l'unicité même en cas de requêtes concurrentes", async () => {
    const results = await Promise.allSettled([
      D.createDistribution({ date: "2026-03-01", assignments: plan(families.slice(0, 3)) }, null),
      D.createDistribution({ date: "2026-03-01", assignments: plan(families.slice(0, 3)) }, null),
      D.createDistribution({ date: "2026-03-01", assignments: plan(families.slice(0, 3)) }, null)
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const [{ c }] = await query("SELECT COUNT(*) AS c FROM distribution_assignments");
    expect(c).toBe(3);
  });

  it("refuse une attribution en double dans la même requête", async () => {
    await expect(D.createDistribution({ date: "2026-03-01", assignments: [{ familyId: families[0], vendorId: vendorA }, { familyId: families[0], vendorId: vendorB }] }, null)).rejects.toMatchObject({ status: 409 });
  });

  it("annule tout si le vendeur est inactif ou la famille inconnue", async () => {
    await updateVendor(vendorB, { name: "Vendeur Bravo", isActive: false }, null);
    await expect(D.createDistribution({ date: "2026-03-01", assignments: plan(families.slice(0, 2)) }, null)).rejects.toMatchObject({ status: 400 });
    await expect(D.createDistribution({ date: "2026-03-01", assignments: [{ familyId: 99999, vendorId: vendorA }] }, null)).rejects.toBeTruthy();
    const [{ c }] = await query("SELECT COUNT(*) AS c FROM distributions");
    expect(c).toBe(0);
  });

  it("valide la date et la liste", async () => {
    await expect(D.createDistribution({ date: "2026-02-31", assignments: plan(families.slice(0, 1)) }, null)).rejects.toMatchObject({ status: 400 });
    await expect(D.createDistribution({ date: "2026-03-01", assignments: [] }, null)).rejects.toMatchObject({ status: 400 });
  });
});

describe("après la distribution", () => {
  it("considère la famille comme servie, sans suivi de retrait", async () => {
    await D.createDistribution({ date: "2026-03-01", assignments: plan(families.slice(0, 2)) }, null);
    const family = await getFamily(families[0]);
    expect(family.benefit).toMatchObject({ vendorId: vendorA });
    const yes = await listFamilies(parseFamilyFilters({ benefited: "yes" }), { page: 1, pageSize: 20, offset: 0 });
    const no = await listFamilies(parseFamilyFilters({ benefited: "no" }), { page: 1, pageSize: 20, offset: 0 });
    expect(yes.total).toBe(2);
    expect(no.total).toBe(8);
    expect(yes.items[0].benefited).toBe(true);
  });

  it("filtre les familles servies par vendeur", async () => {
    await D.createDistribution({ date: "2026-03-01", assignments: plan(families.slice(0, 4)) }, null);
    const res = await listFamilies(parseFamilyFilters({ vendorId: String(vendorB) }), { page: 1, pageSize: 20, offset: 0 });
    expect(res.total).toBe(2);
  });

  it("permet de changer le vendeur d'une famille", async () => {
    const id = await D.createDistribution({ date: "2026-03-01", assignments: plan(families.slice(0, 2)) }, null);
    const d = await D.getDistribution(id);
    const first = d.assignments.find((a) => a.vendorId === vendorA);
    await D.reassignAssignment(first.id, vendorB, null);
    const after = await D.getDistribution(id);
    expect(after.vendors).toHaveLength(1);
    expect(after.vendors[0].vendorName).toBe("Vendeur Bravo");
    await updateVendor(vendorA, { name: "Vendeur Alpha", isActive: false }, null);
    await expect(D.reassignAssignment(first.id, vendorA, null)).rejects.toMatchObject({ status: 400 });
  });

  it("libère les familles quand la distribution est supprimée", async () => {
    const id = await D.createDistribution({ date: "2026-03-01", assignments: plan(families.slice(0, 3)) }, null);
    await D.deleteDistribution(id, null);
    expect((await D.eligibleFamilies(parseFamilyFilters({}))).total).toBe(10);
    await D.createDistribution({ date: "2026-03-05", assignments: plan(families.slice(0, 3)) }, null);
  });

  it("conserve l'historique si la famille ou le vendeur sont modifiés", async () => {
    const id = await D.createDistribution({ date: "2026-03-01", assignments: plan(families.slice(0, 2)) }, null);
    await updateVendor(vendorA, { name: "Nom Changé" }, null);
    await deleteFamily(families[1], null);
    const d = await D.getDistribution(id);
    expect(d.families).toBe(2);
    expect(d.assignments.some((a) => a.familyId === null && a.familyName)).toBe(true);
  });
});

describe("statistiques", () => {
  it("calcule des chiffres exacts", async () => {
    await D.createDistribution({ date: "2026-03-01", assignments: plan(families.slice(0, 4)) }, null);
    await D.createDistribution({ date: "2026-03-01", assignments: plan(families.slice(4, 6)) }, null);
    const s = await allStats(parseStatsFilters({}));
    expect(s.global.totalFamilies).toBe(10);
    expect(s.global.basketsDistributed).toBe(6);
    expect(s.global.familiesBenefited).toBe(6);
    expect(s.global.familiesWaiting).toBe(4);
    expect(s.global.distributionCount).toBe(2);
    expect(s.global.distributionDays).toBe(1);
    expect(s.global.coverageRate).toBe(60);
    expect(s.sponsors[0]).toMatchObject({ families: 10, benefited: 6, waiting: 4 });
    expect(s.vendors.reduce((n, v) => n + v.families, 0)).toBe(6);
    expect(s.waiting).toHaveLength(4);
  });

  it("évite les divisions par zéro", async () => {
    await query("DELETE FROM families");
    const s = await allStats(parseStatsFilters({}));
    expect(s.global.coverageRate).toBeNull();
    expect(s.global.averageFamiliesPerDistribution).toBeNull();
  });

  it("applique les filtres de dates et de vendeur", async () => {
    await D.createDistribution({ date: "2026-03-01", assignments: plan(families.slice(0, 2)) }, null);
    await D.createDistribution({ date: "2026-03-10", assignments: plan(families.slice(2, 6)) }, null);
    const march = await allStats(parseStatsFilters({ from: "2026-03-05", to: "2026-03-31" }));
    expect(march.global.basketsDistributed).toBe(4);
    const byVendor = await allStats(parseStatsFilters({ vendorId: String(vendorA) }));
    expect(byVendor.global.basketsDistributed).toBe(3);
  });
});
