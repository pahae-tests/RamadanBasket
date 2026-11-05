import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, query, mkSponsor } from "./helpers";
const { createFamily, updateFamily, getFamily, checkCin, listFamilies, parseFamilyFilters } = require("../lib/families");
const { closePool } = require("../lib/db");

let sponsorId;
const base = (over = {}) => ({
  representative: { fullName: "Ahmed Benali", cin: "AB123456", phone: "0612345678" },
  members: [{ fullName: "Fatima Benali", cin: "", phone: "0612345678" }],
  sponsorId,
  ...over
});

beforeEach(async () => {
  await resetDb();
  sponsorId = await mkSponsor("Parrain Principal");
});
afterAll(closePool);

describe("enregistrement des familles", () => {
  it("crée une famille valide avec le responsable en premier", async () => {
    const id = await createFamily(base(), null);
    const family = await getFamily(id);
    expect(family.members[0].isRepresentative).toBe(true);
    expect(family.members[0].fullName).toBe("Ahmed Benali");
    expect(family.members).toHaveLength(2);
    expect(family.phone).toBe("0612345678");
    expect(family.sponsorName).toBe("Parrain Principal");
  });

  it("ne stocke ni notes, ni lien de parenté", async () => {
    const id = await createFamily(base(), null);
    const family = await getFamily(id);
    expect(family).not.toHaveProperty("notes");
    expect(family.members[1]).not.toHaveProperty("relationship");
    const cols = await query("SELECT column_name AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name IN ('families','family_members','sponsors','users')");
    const names = cols.map((r) => r.c || r.COLUMN_NAME);
    for (const banned of ["notes", "relationship", "full_name_user"]) expect(names).not.toContain(banned);
    const userCols = await query("SELECT column_name AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users'");
    expect(userCols.map((r) => r.c || r.COLUMN_NAME)).not.toContain("full_name");
    const sponsorCols = await query("SELECT column_name AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'sponsors'");
    expect(sponsorCols.map((r) => r.c || r.COLUMN_NAME)).not.toContain("address");
  });

  it("exige le CIN du responsable", async () => {
    await expect(createFamily(base({ representative: { fullName: "Sans Cin", cin: "", phone: "0612345678" } }), null)).rejects.toMatchObject({ status: 400, details: { "representative.cin": expect.any(String) } });
  });

  it("exige un parrain", async () => {
    await expect(createFamily(base({ sponsorId: null }), null)).rejects.toMatchObject({ status: 400, details: { sponsorId: expect.any(String) } });
    await expect(createFamily(base({ sponsorId: 99999 }), null)).rejects.toMatchObject({ status: 400 });
  });

  it("rejette les numéros invalides, dont 30 chiffres", async () => {
    const long = "070000000000000000000000000000";
    await expect(createFamily(base({ representative: { fullName: "Ahmed Benali", cin: "AB123456", phone: long } }), null)).rejects.toMatchObject({ status: 400, details: { "representative.phone": expect.any(String) } });
    await expect(createFamily(base({ members: [{ fullName: "Fatima", cin: "", phone: "123" }] }), null)).rejects.toMatchObject({ status: 400, details: { "members.0.phone": expect.any(String) } });
  });

  it("rejette un CIN en double (insensible à la casse et aux espaces)", async () => {
    await createFamily(base(), null);
    await expect(createFamily(base({ representative: { fullName: "Autre Personne", cin: "ab 123 456", phone: "0612345678" }, members: [] }), null)).rejects.toMatchObject({ status: 409 });
    const [{ c }] = await query("SELECT COUNT(*) AS c FROM families");
    expect(c).toBe(1);
  });

  it("rejette un CIN de membre déjà utilisé et annule toute la famille", async () => {
    await createFamily(base(), null);
    await expect(createFamily({ representative: { fullName: "Nouveau Responsable", cin: "CD111111", phone: "0612345678" }, members: [{ fullName: "Membre", cin: "AB123456" }], sponsorId }, null)).rejects.toMatchObject({ status: 409 });
    const [{ c }] = await query("SELECT COUNT(*) AS c FROM families");
    expect(c).toBe(1);
  });

  it("rejette un CIN répété dans la même famille", async () => {
    await expect(createFamily({ representative: { fullName: "A B", cin: "AB123456", phone: "0612345678" }, members: [{ fullName: "C D", cin: "AB123456" }], sponsorId }, null)).rejects.toMatchObject({ status: 400 });
  });

  it("accepte plusieurs membres sans CIN", async () => {
    await createFamily({ representative: { fullName: "Resp Un", cin: "AB111111", phone: "0612345678" }, members: [{ fullName: "Membre Un" }, { fullName: "Membre Deux" }], sponsorId }, null);
    await createFamily({ representative: { fullName: "Resp Deux", cin: "AB222222", phone: "0612345678" }, members: [{ fullName: "Membre Trois" }], sponsorId }, null);
    const [{ c }] = await query("SELECT COUNT(*) AS c FROM family_members WHERE cin_norm IS NULL");
    expect(c).toBe(3);
  });

  it("empêche deux créations concurrentes avec le même CIN", async () => {
    const results = await Promise.allSettled([createFamily(base(), null), createFamily(base(), null), createFamily(base(), null)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const [{ c }] = await query("SELECT COUNT(*) AS c FROM families");
    expect(c).toBe(1);
  });

  it("vérifie un CIN pendant la saisie", async () => {
    const id = await createFamily(base(), null);
    const hit = await checkCin("ab123456");
    expect(hit.available).toBe(false);
    expect(hit.existing.familyId).toBe(id);
    expect((await checkCin("ZZ999999")).available).toBe(true);
    expect((await checkCin("12")).valid).toBe(false);
  });
});

describe("modification et liste", () => {
  it("modifie une famille sans dupliquer le responsable", async () => {
    const id = await createFamily(base(), null);
    const family = await getFamily(id);
    await updateFamily(id, { representative: { fullName: "Ahmed Benali Modifié", cin: "AB123456", phone: "0612345678" }, members: [{ id: family.members[1].id, fullName: "Fatima", cin: "", phone: "0612345678" }], sponsorId }, null);
    const after = await getFamily(id);
    expect(after.members).toHaveLength(2);
    expect(after.members[0].fullName).toBe("Ahmed Benali Modifié");
  });

  it("empêche de reprendre le CIN d'une autre famille", async () => {
    await createFamily(base(), null);
    const other = await createFamily({ representative: { fullName: "Autre", cin: "CD222222", phone: "0612345678" }, members: [], sponsorId }, null);
    await expect(updateFamily(other, { representative: { fullName: "Autre", cin: "AB123456", phone: "0612345678" }, members: [], sponsorId }, null)).rejects.toMatchObject({ status: 409 });
  });

  it("liste avec membres, filtre et pagination", async () => {
    for (let i = 0; i < 5; i++) await createFamily({ representative: { fullName: `Famille ${i}`, cin: `AB10000${i}`, phone: "0612345678" }, members: [{ fullName: `Enfant ${i}` }], sponsorId }, null);
    const res = await listFamilies(parseFamilyFilters({}), { page: 1, pageSize: 2, offset: 0 });
    expect(res.total).toBe(5);
    expect(res.items).toHaveLength(2);
    expect(res.items[0].members.length).toBeGreaterThan(0);
    const sponsorFilter = await listFamilies(parseFamilyFilters({ sponsorId: String(sponsorId) }), { page: 1, pageSize: 20, offset: 0 });
    expect(sponsorFilter.total).toBe(5);
    const none = await listFamilies(parseFamilyFilters({ benefited: "yes" }), { page: 1, pageSize: 20, offset: 0 });
    expect(none.total).toBe(0);
  });

  it("cherche intelligemment dans la liste", async () => {
    await createFamily({ representative: { fullName: "Mohamed Alaoui", cin: "AB555555", phone: "0612345678" }, members: [], sponsorId }, null);
    const res = await listFamilies(parseFamilyFilters({ q: "Moahmd" }), { page: 1, pageSize: 20, offset: 0 });
    expect(res.total).toBe(1);
  });
});
