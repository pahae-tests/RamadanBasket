const { query } = require("./db");
const { isValidCin, isValidPhone } = require("./normalize");
const { damerauLevenshtein, scoreName, prepareName } = require("./normalize");

async function duplicateCins() {
  const groups = await query(
    "SELECT cin_norm, COUNT(*) AS c FROM family_members WHERE cin_norm IS NOT NULL GROUP BY cin_norm HAVING c > 1 LIMIT 200"
  );
  if (!groups.length) return [];
  const rows = await query(
    "SELECT cin_norm, id AS memberId, family_id AS familyId, full_name AS name FROM family_members WHERE cin_norm IN (?) ORDER BY cin_norm, id",
    [groups.map((g) => g.cin_norm)]
  );
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.cin_norm)) map.set(r.cin_norm, { cin: r.cin_norm, records: [] });
    map.get(r.cin_norm).records.push({ memberId: r.memberId, familyId: r.familyId, name: r.name });
  }
  return [...map.values()];
}

async function findings() {
  const missingRepCin = await query(
    `SELECT f.id AS familyId, r.full_name AS name FROM families f JOIN family_members r ON r.family_id = f.id AND r.is_representative = 1
     WHERE r.cin_norm IS NULL ORDER BY f.id LIMIT 500`
  );
  const missingPhone = await query(
    `SELECT f.id AS familyId, r.full_name AS name FROM families f LEFT JOIN family_members r ON r.family_id = f.id AND r.is_representative = 1
     WHERE f.phone_norm IS NULL ORDER BY f.id LIMIT 500`
  );
  const noRep = await query(
    `SELECT f.id AS familyId FROM families f WHERE NOT EXISTS (SELECT 1 FROM family_members m WHERE m.family_id = f.id AND m.is_representative = 1) LIMIT 500`
  );
  const members = await query(
    "SELECT id, family_id, full_name, cin_norm, phone_norm FROM family_members WHERE cin_norm IS NOT NULL OR phone_norm IS NOT NULL"
  );
  const invalidCin = [];
  const invalidPhone = [];
  for (const m of members) {
    if (m.cin_norm && !isValidCin(m.cin_norm)) invalidCin.push({ familyId: m.family_id, name: m.full_name, value: m.cin_norm });
    if (m.phone_norm && !isValidPhone(m.phone_norm)) invalidPhone.push({ familyId: m.family_id, name: m.full_name, value: m.phone_norm });
  }
  const duplicatePhones = await query(
    `SELECT f.phone_norm AS phone, GROUP_CONCAT(f.id ORDER BY f.id) AS familyIds, COUNT(*) AS c FROM families f
     WHERE f.phone_norm IS NOT NULL GROUP BY f.phone_norm HAVING c > 1 ORDER BY c DESC LIMIT 100`
  );
  const similarFamilies = await similarRepresentatives();
  const sponsors = await query("SELECT id, full_name FROM sponsors ORDER BY id LIMIT 1000");
  const vendors = await query("SELECT id, name AS full_name FROM vendors ORDER BY id LIMIT 1000");
  return {
    confirmed: {
      duplicateCins: await duplicateCins(),
      familiesWithoutRepresentative: noRep,
      invalidCin,
      invalidPhone
    },
    potential: {
      similarFamilies,
      duplicatePhones: duplicatePhones.map((d) => ({ phone: d.phone, familyIds: String(d.familyIds).split(",").map(Number) })),
      similarSponsors: similarPairs(sponsors),
      similarVendors: similarPairs(vendors)
    },
    warnings: {
      missingRepresentativeCin: missingRepCin,
      missingPhone
    }
  };
}

function similarPairs(rows) {
  const out = [];
  const prepared = rows.map((r) => prepareName(r.full_name));
  for (let i = 0; i < rows.length && out.length < 100; i++) {
    for (let j = i + 1; j < rows.length && out.length < 100; j++) {
      const s = scoreName(prepared[i], prepared[j]);
      if (s.kind === "exact" || s.kind === "approx") out.push({ a: { id: rows[i].id, name: rows[i].full_name }, b: { id: rows[j].id, name: rows[j].full_name }, kind: s.kind });
    }
  }
  return out;
}

async function similarRepresentatives() {
  const reps = await query(
    `SELECT m.family_id AS familyId, m.full_name AS name, m.name_key AS nameKey, f.phone_norm AS phone FROM family_members m JOIN families f ON f.id = m.family_id WHERE m.is_representative = 1 ORDER BY m.name_key LIMIT 3000`
  );
  const out = [];
  const buckets = new Map();
  for (const r of reps) {
    const prefix = (r.nameKey || "").slice(0, 2);
    if (!buckets.has(prefix)) buckets.set(prefix, []);
    buckets.get(prefix).push(r);
  }
  for (const list of buckets.values()) {
    for (let i = 0; i < list.length && out.length < 200; i++) {
      for (let j = i + 1; j < list.length && out.length < 200; j++) {
        const a = list[i];
        const b = list[j];
        const samePhone = a.phone && a.phone === b.phone;
        const dist = damerauLevenshtein(a.nameKey, b.nameKey, 1);
        if (samePhone && dist <= 1) out.push({ a: { familyId: a.familyId, name: a.name }, b: { familyId: b.familyId, name: b.name }, reason: "Noms proches et même téléphone" });
        else if (a.nameKey === b.nameKey && a.nameKey.includes(" ")) out.push({ a: { familyId: a.familyId, name: a.name }, b: { familyId: b.familyId, name: b.name }, reason: "Noms très similaires" });
      }
    }
  }
  return out;
}

module.exports = { findings };
