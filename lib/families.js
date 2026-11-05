const { query, withTransaction } = require("./db");
const { HttpError, isDuplicateError } = require("./errors");
const { validateFamilyInput } = require("./validate");
const { normalizeName, nameKey, normalizeCin, isValidCin, normalizePhone } = require("./normalize");
const { audit } = require("./audit");
const { invalidateSearch } = require("./search");
const { canHaveFamilies, SCOPE_SQL, scopeParams } = require("./sponsorRules");

async function cinOwner(runner, cinNorm, excludeFamilyId = null) {
  const rows = await runner.query(
    `SELECT m.id AS memberId, m.family_id AS familyId, m.full_name AS fullName, m.is_representative AS isRepresentative,
            (SELECT r.full_name FROM family_members r WHERE r.family_id = m.family_id AND r.is_representative = 1 LIMIT 1) AS representativeName
     FROM family_members m WHERE m.cin_norm = ? ${excludeFamilyId ? "AND m.family_id <> ?" : ""} LIMIT 1`,
    excludeFamilyId ? [cinNorm, excludeFamilyId] : [cinNorm]
  );
  return rows[0] || null;
}

async function checkCin(rawCin, excludeFamilyId = null) {
  const cin = normalizeCin(rawCin);
  if (!cin) return { cin: null, valid: true, available: true, existing: null };
  if (!isValidCin(cin)) return { cin, valid: false, available: false, existing: null };
  const owner = await cinOwner({ query }, cin, excludeFamilyId);
  return { cin, valid: true, available: !owner, existing: owner };
}

function memberRow(person, familyId, isRep) {
  return [familyId, person.fullName, normalizeName(person.fullName), nameKey(person.fullName), person.cin, person.cin, person.phone, person.phone, isRep ? 1 : 0];
}

const MEMBER_INSERT =
  "INSERT INTO family_members (family_id, full_name, name_norm, name_key, cin, cin_norm, phone, phone_norm, is_representative) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";

async function assertSponsor(tx, sponsorId) {
  if (!sponsorId) return;
  const rows = await tx.query("SELECT id, type FROM sponsors WHERE id = ? LOCK IN SHARE MODE", [sponsorId]);
  if (!rows[0]) throw new HttpError(400, "Données invalides.", { sponsorId: "Parrain introuvable." });
  if (!canHaveFamilies(rows[0].type)) {
    const why = rows[0].type === "group" ? "Un super-parrain n'a pas de familles : choisissez un de ses parrains." : "Un parrain spécial n'a pas de familles : choisissez un de ses sous-parrains.";
    throw new HttpError(400, "Données invalides.", { sponsorId: why });
  }
}

async function assertCinsFree(tx, input, excludeFamilyId) {
  const errors = {};
  const list = [{ label: "representative", cin: input.representative.cin }, ...input.members.map((m, i) => ({ label: `members.${i}`, cin: m.cin }))];
  for (const entry of list) {
    if (!entry.cin) continue;
    const owner = await cinOwner(tx, entry.cin, excludeFamilyId);
    if (owner) errors[`${entry.label}.cin`] = `CIN déjà utilisé par ${owner.fullName} (famille n° ${owner.familyId}).`;
  }
  if (Object.keys(errors).length) throw new HttpError(409, "Un CIN existe déjà.", errors);
}

function translateDuplicate(error) {
  if (isDuplicateError(error) && /uq_members_cin/.test(error.message || "")) {
    return new HttpError(409, "Un CIN existe déjà.", { cin: "Ce CIN est déjà enregistré." });
  }
  return error;
}

async function createFamily(rawInput, userId) {
  const input = validateFamilyInput(rawInput);
  try {
    const id = await withTransaction(async (tx) => {
      await assertSponsor(tx, input.sponsorId);
      await assertCinsFree(tx, input, null);
      const result = await tx.query(
        "INSERT INTO families (sponsor_id, phone, phone_norm, address, created_by) VALUES (?, ?, ?, ?, ?)",
        [input.sponsorId, input.phone, input.phone, input.address, userId || null]
      );
      const familyId = result.insertId;
      await tx.query(MEMBER_INSERT, memberRow(input.representative, familyId, true));
      for (const member of input.members) {
        await tx.query(MEMBER_INSERT, memberRow(member, familyId, false));
      }
      await audit(tx, userId, "family.create", "family", familyId, { members: input.members.length + 1 });
      return familyId;
    });
    invalidateSearch();
    return id;
  } catch (error) {
    throw translateDuplicate(error);
  }
}

async function updateFamily(familyId, rawInput, userId) {
  const input = validateFamilyInput(rawInput);
  try {
    await withTransaction(async (tx) => {
      const existing = await tx.query("SELECT id FROM families WHERE id = ? FOR UPDATE", [familyId]);
      if (!existing[0]) throw new HttpError(404, "Famille introuvable.");
      await assertSponsor(tx, input.sponsorId);
      await assertCinsFree(tx, input, familyId);
      await tx.query("UPDATE families SET sponsor_id = ?, phone = ?, phone_norm = ?, address = ? WHERE id = ?", [
        input.sponsorId,
        input.phone,
        input.phone,
        input.address,
        familyId
      ]);
      const current = await tx.query("SELECT id, is_representative FROM family_members WHERE family_id = ?", [familyId]);
      const rep = current.find((m) => m.is_representative);
      const keepIds = new Set(input.members.filter((m) => m.id).map((m) => m.id));
      const currentIds = new Set(current.map((m) => m.id));
      for (const member of input.members) {
        if (member.id && !currentIds.has(member.id)) throw new HttpError(400, "Membre invalide.");
      }
      const toDelete = current.filter((m) => !m.is_representative && !keepIds.has(m.id)).map((m) => m.id);
      if (toDelete.length) await tx.query("DELETE FROM family_members WHERE id IN (?)", [toDelete]);
      const clearCins = current.filter((m) => keepIds.has(m.id) || m.is_representative).map((m) => m.id);
      if (clearCins.length) await tx.query("UPDATE family_members SET cin_norm = NULL WHERE id IN (?)", [clearCins]);
      const rp = input.representative;
      if (rep) {
        await tx.query(
          "UPDATE family_members SET full_name = ?, name_norm = ?, name_key = ?, cin = ?, cin_norm = ?, phone = ?, phone_norm = ? WHERE id = ?",
          [rp.fullName, normalizeName(rp.fullName), nameKey(rp.fullName), rp.cin, rp.cin, rp.phone, rp.phone, rep.id]
        );
      } else {
        await tx.query(MEMBER_INSERT, memberRow(rp, familyId, true));
      }
      for (const member of input.members) {
        if (member.id) {
          await tx.query(
            "UPDATE family_members SET full_name = ?, name_norm = ?, name_key = ?, cin = ?, cin_norm = ?, phone = ?, phone_norm = ? WHERE id = ? AND family_id = ?",
            [member.fullName, normalizeName(member.fullName), nameKey(member.fullName), member.cin, member.cin, member.phone, member.phone, member.id, familyId]
          );
        } else {
          await tx.query(MEMBER_INSERT, memberRow(member, familyId, false));
        }
      }
      await audit(tx, userId, "family.update", "family", familyId, null);
    });
    invalidateSearch();
  } catch (error) {
    throw translateDuplicate(error);
  }
}

async function deleteFamily(familyId, userId) {
  await withTransaction(async (tx) => {
    const rows = await tx.query("SELECT id FROM families WHERE id = ? FOR UPDATE", [familyId]);
    if (!rows[0]) throw new HttpError(404, "Famille introuvable.");
    await tx.query("DELETE FROM families WHERE id = ?", [familyId]);
    await audit(tx, userId, "family.delete", "family", familyId, null);
  });
  invalidateSearch();
}

function formatMember(m) {
  return {
    id: m.id,
    fullName: m.full_name,
    cin: m.cin,
    phone: m.phone,
    isRepresentative: Boolean(m.is_representative)
  };
}

async function getFamily(familyId) {
  const families = await query(
    `SELECT f.*, s.full_name AS sponsor_name, s.phone AS sponsor_phone, ps.full_name AS sponsor_parent_name FROM families f LEFT JOIN sponsors s ON s.id = f.sponsor_id LEFT JOIN sponsors ps ON ps.id = s.parent_id WHERE f.id = ?`,
    [familyId]
  );
  const family = families[0];
  if (!family) throw new HttpError(404, "Famille introuvable.");
  const members = await query("SELECT * FROM family_members WHERE family_id = ? ORDER BY is_representative DESC, id ASC", [familyId]);
  const benefit = await query(
    `SELECT a.id, a.assigned_at, a.vendor_id, a.vendor_name_snapshot, d.id AS distribution_id, d.distribution_date
     FROM distribution_assignments a JOIN distributions d ON d.id = a.distribution_id WHERE a.family_id = ? LIMIT 1`,
    [familyId]
  );
  const b = benefit[0];
  return {
    id: family.id,
    sponsorId: family.sponsor_id,
    sponsorName: family.sponsor_name,
    sponsorParentName: family.sponsor_parent_name || null,
    phone: family.phone,
    address: family.address,
    createdAt: family.created_at,
    members: members.map(formatMember),
    benefit: b
      ? { assignmentId: b.id, distributionId: b.distribution_id, date: b.distribution_date, vendorId: b.vendor_id, vendorName: b.vendor_name_snapshot }
      : null
  };
}

const BENEFIT_EXISTS = "EXISTS (SELECT 1 FROM distribution_assignments a WHERE a.family_id = f.id";

function buildFamilyFilter(filters) {
  const where = [];
  const params = [];
  if (filters.sponsorId) {
    where.push(`f.sponsor_id IN ${SCOPE_SQL}`);
    params.push(...scopeParams(filters.sponsorId));
  }
  if (filters.benefited === "yes") where.push(`${BENEFIT_EXISTS})`);
  if (filters.benefited === "no") where.push(`NOT ${BENEFIT_EXISTS})`);
  if (filters.vendorId) {
    where.push(`${BENEFIT_EXISTS} AND a.vendor_id = ?)`);
    params.push(filters.vendorId);
  }
  if (filters.distributionId) {
    where.push(`${BENEFIT_EXISTS} AND a.distribution_id = ?)`);
    params.push(filters.distributionId);
  }
  if (filters.benefitFrom) {
    where.push(`${BENEFIT_EXISTS} AND EXISTS (SELECT 1 FROM distributions d WHERE d.id = a.distribution_id AND d.distribution_date >= ?))`);
    params.push(filters.benefitFrom);
  }
  if (filters.benefitTo) {
    where.push(`${BENEFIT_EXISTS} AND EXISTS (SELECT 1 FROM distributions d WHERE d.id = a.distribution_id AND d.distribution_date <= ?))`);
    params.push(filters.benefitTo);
  }
  if (filters.createdFrom) {
    where.push("DATE(f.created_at) >= ?");
    params.push(filters.createdFrom);
  }
  if (filters.createdTo) {
    where.push("DATE(f.created_at) <= ?");
    params.push(filters.createdTo);
  }
  if (filters.missingPhone) where.push("f.phone_norm IS NULL");
  return { where, params };
}

function parseFamilyFilters(q) {
  const num = (v) => {
    const n = Number.parseInt(v, 10);
    return Number.isInteger(n) && n > 0 ? n : null;
  };
  const date = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  return {
    q: typeof q.q === "string" ? q.q.trim().slice(0, 100) : "",
    sponsorId: num(q.sponsorId),
    benefited: q.benefited === "yes" || q.benefited === "no" ? q.benefited : null,
    vendorId: num(q.vendorId),
    distributionId: num(q.distributionId),
    benefitFrom: date(q.benefitFrom),
    benefitTo: date(q.benefitTo),
    createdFrom: date(q.createdFrom),
    createdTo: date(q.createdTo),
    missingPhone: q.missingPhone === "1"
  };
}

const LIST_SELECT = `
  f.id, f.phone, f.sponsor_id, f.created_at, s.full_name AS sponsor_name, ps.full_name AS sponsor_parent_name,
  r.full_name AS representative_name, r.cin AS representative_cin,
  (SELECT COUNT(*) FROM family_members x WHERE x.family_id = f.id) AS members_count,
  b.assigned_at AS benefit_at, b.vendor_id AS benefit_vendor_id, b.vendor_name_snapshot AS benefit_vendor, b.distribution_id AS benefit_distribution_id, bd.distribution_date AS benefit_date`;

const LIST_FROM = `families f LEFT JOIN sponsors s ON s.id = f.sponsor_id
  LEFT JOIN sponsors ps ON ps.id = s.parent_id
  LEFT JOIN family_members r ON r.family_id = f.id AND r.is_representative = 1
  LEFT JOIN distribution_assignments b ON b.family_id = f.id
  LEFT JOIN distributions bd ON bd.id = b.distribution_id`;

function formatListRow(r) {
  return {
    id: r.id,
    representativeName: r.representative_name,
    representativeCin: r.representative_cin,
    phone: r.phone,
    sponsorId: r.sponsor_id,
    sponsorName: r.sponsor_name,
    sponsorParentName: r.sponsor_parent_name || null,
    membersCount: r.members_count,
    benefited: Boolean(r.benefit_distribution_id),
    benefitDate: r.benefit_date,
    benefitVendorId: r.benefit_vendor_id,
    benefitVendor: r.benefit_vendor,
    benefitDistributionId: r.benefit_distribution_id,
    createdAt: r.created_at,
    members: []
  };
}

async function attachMembers(items) {
  if (!items.length) return items;
  const ids = items.map((i) => i.id);
  const members = await query("SELECT id, family_id, full_name, is_representative FROM family_members WHERE family_id IN (?) ORDER BY is_representative DESC, id ASC", [ids]);
  const byFamily = new Map();
  for (const m of members) {
    if (!byFamily.has(m.family_id)) byFamily.set(m.family_id, []);
    byFamily.get(m.family_id).push({ id: m.id, fullName: m.full_name, isRepresentative: Boolean(m.is_representative) });
  }
  for (const item of items) item.members = byFamily.get(item.id) || [];
  return items;
}

async function listFamilies(filters, { page, pageSize, offset }, { all = false } = {}) {
  const { where, params } = buildFamilyFilter(filters);
  if (filters.q) {
    const { searchFamilies } = require("./search");
    const found = await searchFamilies(filters.q, { limit: 500 });
    const ids = found.map((f) => f.id);
    if (!ids.length) return { items: [], total: 0 };
    where.push("f.id IN (?)");
    params.push(ids);
    const rows = await query(`SELECT ${LIST_SELECT} FROM ${LIST_FROM} WHERE ${where.join(" AND ")}`, params);
    const order = new Map(ids.map((id, i) => [id, i]));
    rows.sort((a, b) => order.get(a.id) - order.get(b.id));
    const items = rows.map(formatListRow);
    const slice = all ? items : items.slice(offset, offset + pageSize);
    return { items: await attachMembers(slice), total: items.length };
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const totalRows = await query(`SELECT COUNT(*) AS c FROM families f ${whereSql}`, params);
  const limitSql = all ? "" : "LIMIT ? OFFSET ?";
  const rows = await query(
    `SELECT ${LIST_SELECT} FROM ${LIST_FROM} ${whereSql} ORDER BY r.full_name ASC, f.id ASC ${limitSql}`,
    all ? params : [...params, pageSize, offset]
  );
  return { items: await attachMembers(rows.map(formatListRow)), total: totalRows[0].c };
}

async function familyDirectory(filters) {
  const { where, params } = buildFamilyFilter(filters);
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const families = await query(
    `SELECT f.id, f.phone, f.sponsor_id, s.full_name AS sponsor_name FROM families f LEFT JOIN sponsors s ON s.id = f.sponsor_id ${whereSql} ORDER BY s.full_name IS NULL, s.full_name, f.id LIMIT 5000`,
    params
  );
  if (!families.length) return [];
  const ids = families.map((f) => f.id);
  const members = await query("SELECT * FROM family_members WHERE family_id IN (?) ORDER BY is_representative DESC, id ASC", [ids]);
  const byFamily = new Map();
  for (const m of members) {
    if (!byFamily.has(m.family_id)) byFamily.set(m.family_id, []);
    byFamily.get(m.family_id).push(formatMember(m));
  }
  const groups = new Map();
  for (const f of families) {
    const key = f.sponsor_id || 0;
    if (!groups.has(key)) groups.set(key, { sponsorId: f.sponsor_id, sponsorName: f.sponsor_name || "Sans parrain", families: [] });
    groups.get(key).families.push({ id: f.id, phone: f.phone, members: byFamily.get(f.id) || [] });
  }
  return [...groups.values()];
}

module.exports = {
  createFamily,
  updateFamily,
  deleteFamily,
  getFamily,
  listFamilies,
  familyDirectory,
  checkCin,
  parseFamilyFilters,
  buildFamilyFilter,
  normalizePhone
};
