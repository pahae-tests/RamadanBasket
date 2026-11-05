const ExcelJS = require("exceljs");
const { query } = require("./db");
const { listFamilies, familyDirectory, parseFamilyFilters } = require("./families");
const { allStats, parseStatsFilters } = require("./stats");
const { HttpError } = require("./errors");
const { sponsorTree, flatten: flattenTree } = require("./sponsorTree");
const { TYPE_LABELS, SCOPE_SQL, scopeParams } = require("./sponsorRules");

const TEXT = "@";
const DATE = "dd/mm/yyyy";
const DATETIME = "dd/mm/yyyy hh:mm";

function toDate(value) {
  if (!value) return null;
  const text = String(value);
  const iso = text.length <= 10 ? `${text}T00:00:00Z` : `${text.replace(" ", "T")}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function col(header, key, width, kind) {
  return { header, key, width, kind };
}

function addSheet(workbook, sheet) {
  const ws = workbook.addWorksheet(sheet.name.slice(0, 31));
  ws.columns = sheet.columns.map((c) => ({ header: c.header, key: c.key, width: c.width || 18 }));
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF065F46" } };
  header.alignment = { vertical: "middle" };
  for (const row of sheet.rows) {
    const values = {};
    for (const c of sheet.columns) {
      let v = row[c.key];
      if (c.kind === "date" || c.kind === "datetime") v = toDate(v);
      else if (c.kind === "text") v = v === null || v === undefined ? null : String(v);
      values[c.key] = v === undefined ? null : v;
    }
    ws.addRow(values);
  }
  sheet.columns.forEach((c, index) => {
    const column = ws.getColumn(index + 1);
    if (c.kind === "text") column.numFmt = TEXT;
    if (c.kind === "date") column.numFmt = DATE;
    if (c.kind === "datetime") column.numFmt = DATETIME;
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];
  if (sheet.columns.length) {
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };
  }
  return ws;
}

function buildWorkbook(sheets) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Ramadan Basket Manager";
  workbook.created = new Date();
  for (const sheet of sheets) addSheet(workbook, sheet);
  return workbook;
}

const familyColumns = [
  col("N° famille", "id", 12),
  col("Responsable", "representativeName", 28),
  col("CIN", "representativeCin", 14, "text"),
  col("Téléphone", "phone", 16, "text"),
  col("Parrain", "sponsorName", 26),
  col("Membres", "membersList", 44),
  col("Nombre de membres", "membersCount", 18),
  col("Statut", "status", 18),
  col("Vendeur", "benefitVendor", 24),
  col("Date de distribution", "benefitDate", 22, "date"),
  col("Date d'inscription", "createdAt", 20, "date")
];

async function familiesSheet(filters, name) {
  const result = await listFamilies(filters, { page: 1, pageSize: 100000, offset: 0 }, { all: true });
  const rows = result.items.map((f) => ({
    ...f,
    membersList: f.members.map((m) => m.fullName).join(", "),
    status: f.benefited ? "Bénéficiaire" : "Non bénéficiaire"
  }));
  return { name, columns: familyColumns, rows };
}

async function membersSheet(filters) {
  const groups = await familyDirectory(filters);
  const rows = [];
  for (const g of groups) {
    for (const f of g.families) {
      for (const m of f.members) {
        rows.push({ familyId: f.id, sponsor: g.sponsorName, name: m.fullName, role: m.isRepresentative ? "Responsable" : "Membre", cin: m.cin, phone: m.phone });
      }
    }
  }
  return {
    name: "Membres",
    columns: [
      col("N° famille", "familyId", 12),
      col("Parrain", "sponsor", 26),
      col("Nom complet", "name", 28),
      col("Rôle", "role", 14),
      col("CIN", "cin", 14, "text"),
      col("Téléphone", "phone", 16, "text")
    ],
    rows
  };
}

async function sponsorsSheet() {
  const { flat } = await sponsorTree();
  const createdRows = await query("SELECT id, created_at FROM sponsors");
  const created = new Map(createdRows.map((r) => [r.id, r.created_at]));
  const rows = flat
    .map((n) => ({
      id: n.id,
      fullName: n.name,
      cin: n.cin,
      phone: n.phone,
      createdAt: created.get(n.id),
      parentName: n.parentName,
      type: TYPE_LABELS[n.type],
      families: n.families,
      benefited: n.benefited
    }))
    .sort((x, y) => x.fullName.localeCompare(y.fullName));
  return {
    name: "Parrains",
    columns: [
      col("N°", "id", 8),
      col("Nom complet", "fullName", 28),
      col("Type", "type", 16),
      col("Rattaché à", "parentName", 26),
      col("CIN", "cin", 14, "text"),
      col("Téléphone", "phone", 16, "text"),
      col("Familles", "families", 10),
      col("Familles servies", "benefited", 16),
      col("Date de création", "createdAt", 20, "date")
    ],
    rows
  };
}

async function vendorsSheet() {
  const rows = await query(
    `SELECT v.id, v.name, v.phone, IF(v.is_active, 'Actif', 'Inactif') AS status,
            (SELECT COUNT(*) FROM distribution_assignments a WHERE a.vendor_id = v.id) AS families
     FROM vendors v ORDER BY v.name`
  );
  return {
    name: "Vendeurs",
    columns: [col("N°", "id", 8), col("Nom", "name", 28), col("Téléphone", "phone", 16, "text"), col("Statut", "status", 12), col("Familles servies", "families", 18)],
    rows
  };
}

async function distributionsSheet(filters) {
  const where = [];
  const params = [];
  if (filters.from) {
    where.push("d.distribution_date >= ?");
    params.push(filters.from);
  }
  if (filters.to) {
    where.push("d.distribution_date <= ?");
    params.push(filters.to);
  }
  const rows = await query(
    `SELECT d.id, d.distribution_date AS date, COUNT(a.id) AS families, COALESCE(SUM(a.members_count_snapshot), 0) AS members, COUNT(DISTINCT a.vendor_id) AS vendors
     FROM distributions d LEFT JOIN distribution_assignments a ON a.distribution_id = d.id
     ${where.length ? "WHERE " + where.join(" AND ") : ""} GROUP BY d.id ORDER BY d.distribution_date DESC, d.id DESC`,
    params
  );
  return {
    name: "Distributions",
    columns: [col("N°", "id", 8), col("Date", "date", 14, "date"), col("Familles", "families", 12), col("Personnes", "members", 12), col("Vendeurs", "vendors", 12)],
    rows
  };
}

const assignmentColumns = [
  col("Date", "date", 14, "date"),
  col("N° distribution", "distributionId", 16),
  col("Vendeur", "vendor", 24),
  col("N° famille", "familyId", 12),
  col("Responsable", "name", 28),
  col("CIN", "cin", 14, "text"),
  col("Téléphone", "phone", 16, "text"),
  col("Parrain", "sponsor", 24),
  col("Membres", "members", 10)
];

async function assignmentsSheet(options, name) {
  const where = [];
  const params = [];
  if (options.distributionId) {
    where.push("a.distribution_id = ?");
    params.push(options.distributionId);
  }
  if (options.vendorId) {
    where.push("a.vendor_id = ?");
    params.push(options.vendorId);
  }
  if (options.sponsorId) {
    where.push(`a.sponsor_id_snapshot IN ${SCOPE_SQL}`);
    params.push(...scopeParams(options.sponsorId));
  }
  if (options.from) {
    where.push("d.distribution_date >= ?");
    params.push(options.from);
  }
  if (options.to) {
    where.push("d.distribution_date <= ?");
    params.push(options.to);
  }
  const rows = await query(
    `SELECT d.distribution_date AS date, d.id AS distributionId, a.vendor_name_snapshot AS vendor, a.family_id AS familyId, a.family_name_snapshot AS name,
            a.family_cin_snapshot AS cin, a.family_phone_snapshot AS phone, a.sponsor_name_snapshot AS sponsor, a.members_count_snapshot AS members
     FROM distribution_assignments a JOIN distributions d ON d.id = a.distribution_id
     ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY d.distribution_date DESC, a.vendor_name_snapshot, a.family_name_snapshot LIMIT 200000`,
    params
  );
  return { name, columns: assignmentColumns, rows };
}

async function statisticsSheets(filters) {
  const s = await allStats(filters);
  const g = s.global;
  const globalRows = [
    ["Total familles", g.totalFamilies],
    ["Total membres", g.totalMembers],
    ["Total parrains", g.totalSponsors],
    ["Vendeurs actifs", g.activeVendors],
    ["Distributions", g.distributionCount],
    ["Jours de distribution", g.distributionDays],
    ["Paniers distribués (familles servies)", g.basketsDistributed],
    ["Personnes servies", g.membersServed],
    ["Familles en attente", g.familiesWaiting],
    ["Taux de couverture (%)", g.coverageRate],
    ["Moyenne de familles par distribution", g.averageFamiliesPerDistribution],
    ["Moyenne de familles par vendeur", g.averageFamiliesPerVendor]
  ].map(([indicator, value]) => ({ indicator, value }));
  return [
    { name: "Synthèse", columns: [col("Indicateur", "indicator", 46), col("Valeur", "value", 16)], rows: globalRows },
    {
      name: "Parrains",
      columns: [
        col("Parrain", "name", 28),
        col("Type", "type", 16),
        col("Rattaché à", "parentName", 26),
        col("Familles", "families", 12),
        col("Membres", "members", 12),
        col("Familles servies", "benefited", 16),
        col("En attente", "waiting", 14),
        col("Couverture (%)", "coverageRate", 16)
      ],
      rows: flattenTree(s.sponsorTree).map((n) => ({ ...n, name: `${"    ".repeat(n.ancestors.length)}${n.name}`, type: n.children.length ? `${TYPE_LABELS[n.type]} (total)` : TYPE_LABELS[n.type] }))
    },
    {
      name: "Vendeurs",
      columns: [col("Vendeur", "name", 28), col("Familles", "families", 14), col("Personnes", "members", 14), col("Part (%)", "share", 12)],
      rows: s.vendors
    },
    {
      name: "Jours",
      columns: [col("Date", "date", 14, "date"), col("Distributions", "distributions", 16), col("Familles", "families", 14), col("Personnes", "members", 14)],
      rows: s.daily
    }
  ];
}

const TYPES = {
  families: async (f) => [await familiesSheet(f.family, "Familles")],
  members: async (f) => [await membersSheet(f.family)],
  sponsors: async () => [await sponsorsSheet()],
  vendors: async () => [await vendorsSheet()],
  distributions: async (f) => [await distributionsSheet(f.stats)],
  assignments: async (f) => [await assignmentsSheet(f.assign, "Attributions")],
  benefited: async (f) => [await familiesSheet({ ...f.family, benefited: "yes" }, "Bénéficiaires")],
  waiting: async (f) => [await familiesSheet({ ...f.family, benefited: "no" }, "En attente")],
  statistics: async (f) => statisticsSheets(f.stats)
};

function parseExportFilters(q) {
  const num = (v) => {
    const n = Number.parseInt(v, 10);
    return Number.isInteger(n) && n > 0 ? n : null;
  };
  const stats = parseStatsFilters(q);
  return {
    family: parseFamilyFilters(q),
    stats,
    assign: {
      distributionId: num(q.distributionId),
      vendorId: stats.vendorId,
      sponsorId: stats.sponsorId,
      from: stats.from,
      to: stats.to
    }
  };
}

async function buildExport(type, q) {
  const builder = TYPES[type];
  if (!builder) throw new HttpError(400, "Type d'export inconnu.");
  const sheets = await builder(parseExportFilters(q));
  return buildWorkbook(sheets);
}

async function buildSnapshotWorkbook() {
  const all = {};
  const conn = await require("./db").getPool().getConnection();
  try {
    await conn.query("SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await conn.query("START TRANSACTION WITH CONSISTENT SNAPSHOT");
    const q = async (sql) => (await conn.query(sql))[0];
    all.families = await q(
      `SELECT f.id, r.full_name AS representative, r.cin, f.phone, s.full_name AS sponsor, f.address, f.created_at AS createdAt
       FROM families f LEFT JOIN sponsors s ON s.id = f.sponsor_id LEFT JOIN family_members r ON r.family_id = f.id AND r.is_representative = 1 ORDER BY f.id`
    );
    all.members = await q(
      `SELECT m.id, m.family_id AS familyId, m.full_name AS name, IF(m.is_representative, 'Responsable', 'Membre') AS role, m.cin, m.phone FROM family_members m ORDER BY m.family_id, m.is_representative DESC, m.id`
    );
    all.sponsors = await q("SELECT id, full_name AS name, cin, phone, created_at AS createdAt FROM sponsors ORDER BY id");
    all.vendors = await q("SELECT id, name, phone, IF(is_active, 'Actif', 'Inactif') AS status, created_at AS createdAt FROM vendors ORDER BY id");
    all.distributions = await q("SELECT id, distribution_date AS date, created_at AS createdAt FROM distributions ORDER BY distribution_date, id");
    all.assignments = await q(
      `SELECT a.id, a.distribution_id AS distributionId, d.distribution_date AS date, a.family_id AS familyId, a.family_name_snapshot AS name, a.family_cin_snapshot AS cin,
              a.family_phone_snapshot AS phone, a.sponsor_name_snapshot AS sponsor, a.vendor_name_snapshot AS vendor, a.members_count_snapshot AS members, a.assigned_at AS assignedAt
       FROM distribution_assignments a JOIN distributions d ON d.id = a.distribution_id ORDER BY d.distribution_date, a.id`
    );
    await conn.commit();
  } catch (error) {
    try {
      await conn.rollback();
    } catch (rollbackError) {
      void rollbackError;
    }
    throw error;
  } finally {
    conn.release();
  }
  const sheets = [
    {
      name: "Familles",
      columns: [col("N°", "id", 8), col("Responsable", "representative", 28), col("CIN", "cin", 14, "text"), col("Téléphone", "phone", 16, "text"), col("Parrain", "sponsor", 26), col("Adresse", "address", 28), col("Date d'inscription", "createdAt", 20, "date")],
      rows: all.families
    },
    {
      name: "Membres",
      columns: [col("N°", "id", 8), col("N° famille", "familyId", 12), col("Nom complet", "name", 28), col("Rôle", "role", 14), col("CIN", "cin", 14, "text"), col("Téléphone", "phone", 16, "text")],
      rows: all.members
    },
    {
      name: "Parrains",
      columns: [col("N°", "id", 8), col("Nom complet", "name", 28), col("CIN", "cin", 14, "text"), col("Téléphone", "phone", 16, "text"), col("Date de création", "createdAt", 20, "date")],
      rows: all.sponsors
    },
    {
      name: "Vendeurs",
      columns: [col("N°", "id", 8), col("Nom", "name", 28), col("Téléphone", "phone", 16, "text"), col("Statut", "status", 12), col("Date de création", "createdAt", 20, "date")],
      rows: all.vendors
    },
    {
      name: "Distributions",
      columns: [col("N°", "id", 8), col("Date", "date", 14, "date"), col("Date de création", "createdAt", 20, "date")],
      rows: all.distributions
    },
    {
      name: "Attributions",
      columns: [
        col("N°", "id", 8),
        col("N° distribution", "distributionId", 16),
        col("Date", "date", 14, "date"),
        col("N° famille", "familyId", 12),
        col("Responsable", "name", 28),
        col("CIN", "cin", 14, "text"),
        col("Téléphone", "phone", 16, "text"),
        col("Parrain", "sponsor", 24),
        col("Vendeur", "vendor", 24),
        col("Membres", "members", 10),
        col("Attribué le", "assignedAt", 20, "datetime")
      ],
      rows: all.assignments
    }
  ];
  return buildWorkbook(sheets);
}

function slug(text) {
  return String(text || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function ddmmyyyy(iso) {
  return `${iso.slice(8, 10)}${iso.slice(5, 7)}${iso.slice(0, 4)}`;
}

const BASE_NAMES = {
  families: "familles",
  members: "membres",
  sponsors: "parrains",
  vendors: "vendeurs",
  distributions: "distributions",
  assignments: "attributions",
  benefited: "familles",
  waiting: "familles",
  statistics: "statistiques"
};

async function buildExportFilename(type, q, today) {
  const f = parseExportFilters(q);
  const parts = [BASE_NAMES[type] || "export", ddmmyyyy(today)];
  const sponsorId = f.family.sponsorId || f.stats.sponsorId;
  const vendorId = f.family.vendorId || f.stats.vendorId;
  if (sponsorId) {
    const rows = await query("SELECT full_name FROM sponsors WHERE id = ?", [sponsorId]);
    parts.push(slug(rows[0] ? rows[0].full_name : "") || `parrain-${sponsorId}`);
  }
  if (vendorId) {
    const rows = await query("SELECT name FROM vendors WHERE id = ?", [vendorId]);
    parts.push(slug(rows[0] ? rows[0].name : "") || `vendeur-${vendorId}`);
  }
  if (type === "benefited" || f.family.benefited === "yes") parts.push("beneficie");
  if (type === "waiting" || f.family.benefited === "no") parts.push("non-beneficie");
  if (f.family.q) {
    const term = slug(f.family.q);
    if (term) parts.push(`recherche-${term}`);
  }
  const from = f.stats.from || f.family.benefitFrom || f.family.createdFrom;
  const to = f.stats.to || f.family.benefitTo || f.family.createdTo;
  if (from && to) parts.push(`du-${ddmmyyyy(from)}-au-${ddmmyyyy(to)}`);
  else if (from) parts.push(`depuis-${ddmmyyyy(from)}`);
  else if (to) parts.push(`jusqu-${ddmmyyyy(to)}`);
  return `${parts.join("_")}.xlsx`;
}

async function workbookToBuffer(workbook) {
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

module.exports = { buildExport, buildExportFilename, slug, buildSnapshotWorkbook, workbookToBuffer, buildWorkbook, TYPES };
