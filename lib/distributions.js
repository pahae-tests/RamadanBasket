const { query, withTransaction } = require("./db");
const { HttpError } = require("./errors");
const { validateDate } = require("./validate");
const { audit } = require("./audit");
const { buildFamilyFilter } = require("./families");
const { invalidateSearch } = require("./search");

function todayCasablanca() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Casablanca", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

const NEVER_SERVED = "NOT EXISTS (SELECT 1 FROM distribution_assignments a WHERE a.family_id = f.id)";
const ELIGIBLE_SELECT = `f.id, f.created_at, f.phone, f.sponsor_id, s.full_name AS sponsor_name, ps.full_name AS sponsor_parent_name,
  r.full_name AS representative_name, r.cin AS representative_cin,
  (SELECT COUNT(*) FROM family_members x WHERE x.family_id = f.id) AS members_count`;
const ELIGIBLE_FROM = "families f LEFT JOIN sponsors s ON s.id = f.sponsor_id LEFT JOIN sponsors ps ON ps.id = s.parent_id LEFT JOIN family_members r ON r.family_id = f.id AND r.is_representative = 1";

function formatEligible(r) {
  return {
    id: r.id,
    representativeName: r.representative_name,
    representativeCin: r.representative_cin,
    phone: r.phone,
    sponsorId: r.sponsor_id,
    sponsorName: r.sponsor_name,
    sponsorParentName: r.sponsor_parent_name || null,
    membersCount: r.members_count,
    createdAt: r.created_at
  };
}

async function eligibleFamilies(filters, { limit = 200, offset = 0, q = "" } = {}) {
  const base = { ...filters, benefited: null, vendorId: null, distributionId: null, benefitFrom: null, benefitTo: null };
  const { where, params } = buildFamilyFilter(base);
  where.push(NEVER_SERVED);
  let ids = null;
  if (q) {
    const { searchFamilies } = require("./search");
    const found = await searchFamilies(q, { limit: 500 });
    ids = found.map((f) => f.id);
    if (!ids.length) return { items: [], total: 0 };
    where.push("f.id IN (?)");
    params.push(ids);
  }
  const whereSql = `WHERE ${where.join(" AND ")}`;
  const totalRows = await query(`SELECT COUNT(*) AS c FROM families f ${whereSql}`, params);
  const order = ids ? "" : "ORDER BY f.created_at ASC, f.id ASC";
  const rows = await query(`SELECT ${ELIGIBLE_SELECT} FROM ${ELIGIBLE_FROM} ${whereSql} ${order}`, params);
  let ordered = rows;
  if (ids) {
    const rank = new Map(ids.map((id, i) => [id, i]));
    ordered = [...rows].sort((a, b) => rank.get(a.id) - rank.get(b.id));
  }
  return { items: ordered.slice(offset, offset + limit).map(formatEligible), total: totalRows[0].c };
}

async function autoSelect(count, filters, excludeIds = []) {
  if (!Number.isInteger(count) || count <= 0) throw new HttpError(400, "Le nombre de familles doit être un entier positif.");
  const base = { ...filters, benefited: null, vendorId: null, distributionId: null, benefitFrom: null, benefitTo: null };
  const { where, params } = buildFamilyFilter(base);
  where.push(NEVER_SERVED);
  const excluded = excludeIds.map(Number).filter(Number.isInteger);
  if (excluded.length) {
    where.push("f.id NOT IN (?)");
    params.push(excluded);
  }
  const rows = await query(
    `SELECT ${ELIGIBLE_SELECT} FROM ${ELIGIBLE_FROM} WHERE ${where.join(" AND ")} ORDER BY f.created_at ASC, f.id ASC LIMIT ?`,
    [...params, count]
  );
  return {
    requested: count,
    selected: rows.length,
    shortfall: Math.max(0, count - rows.length),
    policy: "Les familles inscrites depuis le plus longtemps sont servies en premier. Seules les familles qui n'ont encore jamais bénéficié sont proposées.",
    items: rows.map(formatEligible)
  };
}

function balancedAllocation(total, vendorIds, weights = null) {
  if (!vendorIds.length) return {};
  const w = weights && weights.length === vendorIds.length ? weights : vendorIds.map(() => 1);
  const sum = w.reduce((a, b) => a + b, 0);
  if (sum <= 0) return {};
  const raw = w.map((x) => (total * x) / sum);
  const base = raw.map(Math.floor);
  let remaining = total - base.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - base[i] })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; remaining > 0; k++, remaining--) base[order[k % order.length].i] += 1;
  const out = {};
  vendorIds.forEach((id, i) => {
    out[id] = base[i];
  });
  return out;
}

function planAssignments(familyIds, quantities) {
  const entries = Object.entries(quantities).map(([vendorId, qty]) => [Number(vendorId), Number(qty)]);
  const total = entries.reduce((a, [, q]) => a + q, 0);
  if (entries.some(([, q]) => !Number.isInteger(q) || q < 0)) throw new HttpError(400, "Quantités invalides.");
  if (total < familyIds.length) throw new HttpError(400, `Sous-allocation : ${total} allouées pour ${familyIds.length} familles.`);
  if (total > familyIds.length) throw new HttpError(400, `Sur-allocation : ${total} allouées pour ${familyIds.length} familles.`);
  const plan = [];
  let cursor = 0;
  for (const [vendorId, qty] of entries) {
    for (let i = 0; i < qty; i++) plan.push({ familyId: familyIds[cursor++], vendorId });
  }
  return plan;
}

async function createDistribution(input, userId) {
  const date = validateDate(input && input.date);
  if (!date) throw new HttpError(400, "Date invalide.");
  const assignments = Array.isArray(input.assignments) ? input.assignments : [];
  if (!assignments.length) throw new HttpError(400, "Aucune famille sélectionnée.");
  if (assignments.length > 5000) throw new HttpError(400, "Trop de familles dans une même distribution.");
  const seen = new Set();
  for (const a of assignments) {
    if (!Number.isInteger(a.familyId) || !Number.isInteger(a.vendorId)) throw new HttpError(400, "Attribution invalide.");
    if (seen.has(a.familyId)) throw new HttpError(409, `La famille n° ${a.familyId} est attribuée deux fois.`);
    seen.add(a.familyId);
  }
  const id = await withTransaction(async (tx) => {
    const familyIds = [...seen];
    const families = await tx.query(
      `SELECT f.id, f.phone, f.sponsor_id, s.full_name AS sponsor_name, r.full_name AS rep_name, r.cin AS rep_cin,
              (SELECT COUNT(*) FROM family_members x WHERE x.family_id = f.id) AS members_count
       FROM families f LEFT JOIN sponsors s ON s.id = f.sponsor_id LEFT JOIN family_members r ON r.family_id = f.id AND r.is_representative = 1
       WHERE f.id IN (?) FOR UPDATE`,
      [familyIds]
    );
    if (families.length !== familyIds.length) throw new HttpError(400, "Une ou plusieurs familles sont introuvables.");
    const already = await tx.query(
      "SELECT a.family_id, a.family_name_snapshot FROM distribution_assignments a WHERE a.family_id IN (?) LIMIT 5",
      [familyIds]
    );
    if (already.length) {
      throw new HttpError(409, `Déjà bénéficiaire : ${already.map((x) => x.family_name_snapshot).join(", ")}. Une famille ne peut recevoir qu'un seul panier.`, {
        familyIds: already.map((x) => x.family_id)
      });
    }
    const vendorIds = [...new Set(assignments.map((a) => a.vendorId))];
    const vendors = await tx.query("SELECT id, name, is_active FROM vendors WHERE id IN (?)", [vendorIds]);
    if (vendors.length !== vendorIds.length) throw new HttpError(400, "Un ou plusieurs vendeurs sont introuvables.");
    const inactive = vendors.find((v) => !v.is_active);
    if (inactive) throw new HttpError(400, `Le vendeur « ${inactive.name} » est inactif.`);
    const result = await tx.query("INSERT INTO distributions (distribution_date, created_by) VALUES (?, ?)", [date, userId || null]);
    const distributionId = result.insertId;
    const famMap = new Map(families.map((f) => [f.id, f]));
    const venMap = new Map(vendors.map((v) => [v.id, v]));
    const values = assignments.map((a) => {
      const f = famMap.get(a.familyId);
      return [distributionId, a.familyId, a.vendorId, f.rep_name || "Inconnu", f.rep_cin, f.phone, f.sponsor_id, f.sponsor_name, venMap.get(a.vendorId).name, f.members_count];
    });
    for (let i = 0; i < values.length; i += 500) {
      await tx.query(
        `INSERT INTO distribution_assignments (distribution_id, family_id, vendor_id, family_name_snapshot, family_cin_snapshot, family_phone_snapshot, sponsor_id_snapshot, sponsor_name_snapshot, vendor_name_snapshot, members_count_snapshot) VALUES ?`,
        [values.slice(i, i + 500)]
      );
    }
    await audit(tx, userId, "distribution.create", "distribution", distributionId, { date, families: assignments.length });
    return distributionId;
  });
  invalidateSearch();
  return id;
}

async function listDistributions({ pageSize, offset }) {
  const totalRows = await query("SELECT COUNT(*) AS c FROM distributions");
  const rows = await query(
    `SELECT d.id, d.distribution_date, d.created_at, COUNT(a.id) AS families, COUNT(DISTINCT a.vendor_id) AS vendors,
            COALESCE(SUM(a.members_count_snapshot), 0) AS members
     FROM distributions d LEFT JOIN distribution_assignments a ON a.distribution_id = d.id
     GROUP BY d.id ORDER BY d.distribution_date DESC, d.id DESC LIMIT ? OFFSET ?`,
    [pageSize, offset]
  );
  return {
    items: rows.map((r) => ({ id: r.id, date: r.distribution_date, createdAt: r.created_at, families: Number(r.families), vendors: Number(r.vendors), members: Number(r.members) })),
    total: totalRows[0].c
  };
}

async function getDistribution(id, { vendorId = null, q = "" } = {}) {
  const heads = await query(
    `SELECT d.id, d.distribution_date, d.created_at, COUNT(a.id) AS families, COALESCE(SUM(a.members_count_snapshot), 0) AS members
     FROM distributions d LEFT JOIN distribution_assignments a ON a.distribution_id = d.id WHERE d.id = ? GROUP BY d.id`,
    [id]
  );
  if (!heads[0]) throw new HttpError(404, "Distribution introuvable.");
  const byVendor = await query(
    `SELECT a.vendor_id, a.vendor_name_snapshot AS vendor_name, COUNT(*) AS families, SUM(a.members_count_snapshot) AS members
     FROM distribution_assignments a WHERE a.distribution_id = ? GROUP BY a.vendor_id, a.vendor_name_snapshot ORDER BY vendor_name`,
    [id]
  );
  const where = ["a.distribution_id = ?"];
  const params = [id];
  if (vendorId) {
    where.push("a.vendor_id = ?");
    params.push(vendorId);
  }
  const assignments = await query(
    `SELECT a.*, ps.full_name AS sponsor_parent_name FROM distribution_assignments a LEFT JOIN sponsors s ON s.id = a.sponsor_id_snapshot LEFT JOIN sponsors ps ON ps.id = s.parent_id WHERE ${where.join(" AND ")} ORDER BY a.vendor_name_snapshot, a.family_name_snapshot LIMIT 5000`,
    params
  );
  let rows = assignments;
  const text = String(q || "").trim();
  if (text) {
    const { scoreName, prepareName, normalizeCin } = require("./normalize");
    const prep = prepareName(text);
    const cin = normalizeCin(text);
    const digits = text.replace(/\D/g, "");
    rows = assignments.filter((a) => {
      if (scoreName(prep, a.family_name_snapshot).kind !== "none") return true;
      if (cin && a.family_cin_snapshot && a.family_cin_snapshot.includes(cin)) return true;
      return digits.length >= 4 && a.family_phone_snapshot && a.family_phone_snapshot.includes(digits);
    });
  }
  const h = heads[0];
  return {
    id: h.id,
    date: h.distribution_date,
    createdAt: h.created_at,
    families: Number(h.families),
    members: Number(h.members),
    vendors: byVendor.map((v) => ({ vendorId: v.vendor_id, vendorName: v.vendor_name, families: Number(v.families), members: Number(v.members) })),
    assignments: rows.map((a) => ({
      id: a.id,
      familyId: a.family_id,
      familyName: a.family_name_snapshot,
      familyCin: a.family_cin_snapshot,
      familyPhone: a.family_phone_snapshot,
      sponsorName: a.sponsor_name_snapshot,
      sponsorParentName: a.sponsor_parent_name || null,
      vendorId: a.vendor_id,
      vendorName: a.vendor_name_snapshot,
      membersCount: a.members_count_snapshot
    }))
  };
}

async function reassignAssignment(assignmentId, vendorId, userId) {
  await withTransaction(async (tx) => {
    const rows = await tx.query("SELECT id, distribution_id FROM distribution_assignments WHERE id = ? FOR UPDATE", [assignmentId]);
    if (!rows[0]) throw new HttpError(404, "Attribution introuvable.");
    const vendors = await tx.query("SELECT id, name, is_active FROM vendors WHERE id = ?", [vendorId]);
    if (!vendors[0] || !vendors[0].is_active) throw new HttpError(400, "Vendeur invalide ou inactif.");
    await tx.query("UPDATE distribution_assignments SET vendor_id = ?, vendor_name_snapshot = ? WHERE id = ?", [vendors[0].id, vendors[0].name, assignmentId]);
    await audit(tx, userId, "assignment.reassign", "assignment", assignmentId, { distributionId: rows[0].distribution_id, vendorId });
  });
}

async function deleteDistribution(id, userId) {
  await withTransaction(async (tx) => {
    const rows = await tx.query("SELECT id FROM distributions WHERE id = ? FOR UPDATE", [id]);
    if (!rows[0]) throw new HttpError(404, "Distribution introuvable.");
    await tx.query("DELETE FROM distributions WHERE id = ?", [id]);
    await audit(tx, userId, "distribution.delete", "distribution", id, null);
  });
}

module.exports = {
  todayCasablanca,
  eligibleFamilies,
  autoSelect,
  balancedAllocation,
  planAssignments,
  createDistribution,
  listDistributions,
  getDistribution,
  reassignAssignment,
  deleteDistribution
};
