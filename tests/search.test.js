import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDb, mkSponsor, mkVendor, mkFamily } from "./helpers";
const { searchFamilies, searchSponsors, searchVendors, invalidateSearch } = require("../lib/search");
const { createSponsor, createVendor } = require("../lib/entities");
const { closePool } = require("../lib/db");

beforeEach(resetDb);
afterAll(closePool);

describe("recherche de parrains", () => {
  it("trouve Mohamed depuis Moahmd et depuis l'arabe", async () => {
    await mkSponsor("Mohamed Alaoui");
    await mkSponsor("Fatima Zahra");
    for (const q of ["Moahmd", "محمد", "mohamd", "MOHAMED"]) {
      const found = await searchSponsors(q);
      expect(found.map((s) => s.full_name), q).toContain("Mohamed Alaoui");
      expect(found.map((s) => s.full_name), q).not.toContain("Fatima Zahra");
    }
  });

  it("trouve Bouknitir depuis boqnitir et بوقنيطير", async () => {
    await mkSponsor("Bouknitir");
    await mkSponsor("Hassan Benali");
    for (const q of ["boqnitir", "بوقنيطير", "bouknitir", "Bokniter"]) {
      const found = await searchSponsors(q);
      expect(found.map((s) => s.full_name), q).toContain("Bouknitir");
    }
  });

  it("trouve Loubna depuis Lobna", async () => {
    await mkSponsor("Loubna El Amrani");
    expect((await searchSponsors("Lobna")).map((s) => s.full_name)).toContain("Loubna El Amrani");
  });

  it("ne confond pas Ahmed et Mohamed", async () => {
    await mkSponsor("Mohamed Alaoui");
    expect(await searchSponsors("Ahmed")).toHaveLength(0);
  });

  it("trouve par CIN et téléphone", async () => {
    await mkSponsor("Karim Idrissi", { cin: "XY123456", phone: "0661234567" });
    expect((await searchSponsors("xy123456"))[0].full_name).toBe("Karim Idrissi");
    expect((await searchSponsors("0661234567"))[0].full_name).toBe("Karim Idrissi");
  });

  it("résiste aux injections SQL", async () => {
    await mkSponsor("Karim Idrissi");
    expect(await searchSponsors("' OR 1=1 --")).toHaveLength(0);
    expect(await searchSponsors("%")).toHaveLength(0);
  });

  it("reflète immédiatement les créations", async () => {
    expect(await searchSponsors("Zineb")).toHaveLength(0);
    await mkSponsor("Zineb Tazi");
    expect(await searchSponsors("Zineb")).toHaveLength(1);
  });

  it("signale un parrain proche à la création sans le fusionner", async () => {
    await createSponsor({ fullName: "Bouknitir", cin: "BK111111", phone: "0612345678" }, null);
    await expect(createSponsor({ fullName: "boqnitir", cin: "BK222222", phone: "0612345679" }, null)).rejects.toMatchObject({ status: 409, details: { similar: [{ fullName: "Bouknitir" }] } });
    const id = await createSponsor({ fullName: "boqnitir", cin: "BK222222", phone: "0612345679" }, null, { force: true });
    expect(id).toBeGreaterThan(0);
  });
});

describe("recherche de vendeurs", () => {
  it("trouve avec fautes et en arabe", async () => {
    await mkVendor("Mohamed Vendeur");
    await mkVendor("Said Boutaleb");
    expect((await searchVendors("Moahmd")).map((v) => v.name)).toContain("Mohamed Vendeur");
    expect((await searchVendors("محمد")).map((v) => v.name)).toContain("Mohamed Vendeur");
  });

  it("filtre les vendeurs inactifs", async () => {
    const id = await mkVendor("Vendeur Actif");
    const inactive = await mkVendor("Vendeur Dormant");
    const { updateVendor } = require("../lib/entities");
    await updateVendor(inactive, { name: "Vendeur Dormant", isActive: false }, null);
    const found = await searchVendors("Vendeur", 10, true);
    expect(found.map((v) => v.id)).toEqual([id]);
  });

  it("refuse un doublon exact", async () => {
    await createVendor({ name: "Said Boutaleb" }, null);
    await expect(createVendor({ name: "said boutaleb" }, null, { force: true })).rejects.toMatchObject({ status: 409 });
  });
});

describe("recherche de familles", () => {
  it("trouve par nom du responsable avec fautes", async () => {
    const s = await mkSponsor();
    await mkFamily("Mohamed Alaoui", s);
    await mkFamily("Fatima Benali", s);
    const found = await searchFamilies("Moahmd");
    expect(found).toHaveLength(1);
  });

  it("trouve par le nom d'un membre", async () => {
    const s = await mkSponsor();
    const id = await mkFamily("Hassan Tazi", s, { members: [{ fullName: "Loubna Tazi", cin: "", phone: "" }] });
    const found = await searchFamilies("Lobna");
    expect(found.map((f) => f.id)).toContain(id);
  });

  it("trouve par CIN et téléphone", async () => {
    const s = await mkSponsor();
    const id = await mkFamily("Hassan Tazi", s, { cin: "CD654321", phone: "0677777771" });
    expect((await searchFamilies("cd654321")).map((f) => f.id)).toContain(id);
    expect((await searchFamilies("0677777771")).map((f) => f.id)).toContain(id);
  });

  it("filtre par parrain", async () => {
    const a = await mkSponsor("Parrain A");
    const b = await mkSponsor("Parrain B");
    await mkFamily("Mohamed Un", a);
    const two = await mkFamily("Mohamed Deux", b);
    invalidateSearch();
    expect((await searchFamilies("Mohamed", { sponsorId: b })).map((f) => f.id)).toEqual([two]);
  });
});
