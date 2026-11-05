const { query } = require("./db");
const { SCOPE_SQL, scopeParams } = require("./sponsorRules");
const { sponsorTree } = require("./sponsorTree");

function pct(part, whole) {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
}

function avg(sum, count) {
  return count > 0 ? Math.round((sum / count) * 10) / 10 : null;
}

function parseStatsFilters(q) {
  const date = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const num = (v) => {
    const n = Number.parseInt(v, 10);
    return Number.isInteger(n) && n > 0 ? n : null;
  };
  return { from: date(q.from), to: date(q.to), sponsorId: num(q.sponsorId), vendorId: num(q.vendorId) };
}

function assignmentWhere(filters, alias = "a", dAlias = "d") {
  const where = [];
  const params = [];
  if (filters.from) {
    where.push(`${dAlias}.distribution_date >= ?`);
    params.push(filters.from);
  }
  if (filters.to) {
    where.push(`${dAlias}.distribution_date <= ?`);
    params.push(filters.to);
  }
  if (filters.sponsorId) {
    where.push(`${alias}.sponsor_id_snapshot IN ${SCOPE_SQL}`);
    params.push(...scopeParams(filters.sponsorId));
  }
  if (filters.vendorId) {
    where.push(`${alias}.vendor_id = ?`);
    params.push(filters.vendorId);
  }
  return { sql: where.length ? "AND " + where.join(" AND ") : "", params };
}

async function globalStats(filters) {
  const aw = assignmentWhere(filters);
  const sponsorWhere = filters.sponsorId ? `WHERE sponsor_id IN ${SCOPE_SQL}` : "";
  const sponsorParams = filters.sponsorId ? scopeParams(filters.sponsorId) : [];
  const [fam] = await query(`SELECT COUNT(*) AS c FROM families ${sponsorWhere}`, sponsorParams);
  const [mem] = await query(
    `SELECT COUNT(*) AS c FROM family_members m ${filters.sponsorId ? `JOIN families f ON f.id = m.family_id WHERE f.sponsor_id IN ${SCOPE_SQL}` : ""}`,
    sponsorParams
  );
  const [spons] = await query("SELECT COUNT(*) AS c FROM sponsors");
  const [vend] = await query("SELECT COUNT(*) AS c FROM vendors WHERE is_active = 1");
  const [agg] = await query(
    `SELECT COUNT(DISTINCT d.id) AS distributions, COUNT(DISTINCT d.distribution_date) AS days, COUNT(a.id) AS families,
            COALESCE(SUM(a.members_count_snapshot), 0) AS members, COUNT(DISTINCT a.vendor_id) AS vendors
     FROM distributions d JOIN distribution_assignments a ON a.distribution_id = d.id WHERE 1=1 ${aw.sql}`,
    aw.params
  );
  const [served] = await query(
    `SELECT COUNT(*) AS c FROM families f WHERE ${filters.sponsorId ? `f.sponsor_id IN ${SCOPE_SQL} AND` : ""} EXISTS (SELECT 1 FROM distribution_assignments a WHERE a.family_id = f.id)`,
    sponsorParams
  );
  const families = Number(agg.families);
  return {
    totalFamilies: fam.c,
    totalMembers: mem.c,
    totalSponsors: spons.c,
    activeVendors: vend.c,
    distributionCount: Number(agg.distributions),
    distributionDays: Number(agg.days),
    basketsDistributed: families,
    membersServed: Number(agg.members),
    familiesBenefited: served.c,
    familiesWaiting: fam.c - served.c,
    coverageRate: pct(served.c, fam.c),
    averageFamiliesPerDistribution: avg(families, Number(agg.distributions)),
    averageFamiliesPerVendor: avg(families, Number(agg.vendors))
  };
}

async function sponsorStats(filters) {
  const { tree, flat } = await sponsorTree({ sponsorId: filters.sponsorId });
  return { flat, tree };
}

async function vendorStats(filters) {
  const aw = assignmentWhere(filters);
  const rows = await query(
    `SELECT a.vendor_id, a.vendor_name_snapshot AS name, COUNT(*) AS families, SUM(a.members_count_snapshot) AS members
     FROM distribution_assignments a JOIN distributions d ON d.id = a.distribution_id WHERE 1=1 ${aw.sql}
     GROUP BY a.vendor_id, a.vendor_name_snapshot ORDER BY families DESC, name`,
    aw.params
  );
  const total = rows.reduce((s, r) => s + Number(r.families), 0);
  return rows.map((r) => ({ id: r.vendor_id, name: r.name, families: Number(r.families), members: Number(r.members), share: pct(Number(r.families), total) }));
}

async function dailyStats(filters) {
  const aw = assignmentWhere(filters);
  const rows = await query(
    `SELECT d.distribution_date AS date, COUNT(DISTINCT d.id) AS distributions, COUNT(a.id) AS families, COALESCE(SUM(a.members_count_snapshot), 0) AS members
     FROM distributions d JOIN distribution_assignments a ON a.distribution_id = d.id WHERE 1=1 ${aw.sql}
     GROUP BY d.distribution_date ORDER BY d.distribution_date`,
    aw.params
  );
  const byVendor = await query(
    `SELECT d.distribution_date AS date, a.vendor_name_snapshot AS vendor, COUNT(*) AS families
     FROM distribution_assignments a JOIN distributions d ON d.id = a.distribution_id WHERE 1=1 ${aw.sql}
     GROUP BY d.distribution_date, a.vendor_name_snapshot ORDER BY d.distribution_date`,
    aw.params
  );
  return {
    days: rows.map((r) => ({ date: r.date, distributions: Number(r.distributions), families: Number(r.families), members: Number(r.members) })),
    byVendor: byVendor.map((r) => ({ date: r.date, vendor: r.vendor, families: Number(r.families) }))
  };
}

async function waitingStats(filters) {
  const where = [filters.sponsorId ? `f.sponsor_id IN ${SCOPE_SQL}` : null, "NOT EXISTS (SELECT 1 FROM distribution_assignments a WHERE a.family_id = f.id)"].filter(Boolean);
  const params = filters.sponsorId ? scopeParams(filters.sponsorId) : [];
  const rows = await query(
    `SELECT f.id, f.created_at, r.full_name AS name, s.full_name AS sponsor, ps.full_name AS sponsor_parent,
            (SELECT COUNT(*) FROM family_members x WHERE x.family_id = f.id) AS members
     FROM families f LEFT JOIN family_members r ON r.family_id = f.id AND r.is_representative = 1 LEFT JOIN sponsors s ON s.id = f.sponsor_id LEFT JOIN sponsors ps ON ps.id = s.parent_id
     WHERE ${where.join(" AND ")} ORDER BY f.created_at ASC, f.id ASC LIMIT 10`,
    params
  );
  return rows.map((r) => ({ id: r.id, name: r.name, sponsor: r.sponsor, sponsorParent: r.sponsor_parent || null, members: r.members, registeredAt: r.created_at }));
}

async function allStats(filters) {
  const [global, sponsorData, vendors, daily, waiting] = await Promise.all([
    globalStats(filters),
    sponsorStats(filters),
    vendorStats(filters),
    dailyStats(filters),
    waitingStats(filters)
  ]);
  return { global, sponsors: sponsorData.flat, sponsorTree: sponsorData.tree, vendors, daily: daily.days, dailyByVendor: daily.byVendor, waiting };
}

module.exports = { allStats, globalStats, sponsorStats, vendorStats, dailyStats, waitingStats, parseStatsFilters, pct };
