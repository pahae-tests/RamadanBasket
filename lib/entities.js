const { query, withTransaction } = require("./db");
const { parseType, parseParentId, assertParent, assertChangeAllowed, PARENT_TYPES } = require("./sponsorRules");
const { HttpError } = require("./errors");
const { validateNamedEntity } = require("./validate");
const { searchSponsors, searchVendors } = require("./search");
const { sponsorTree } = require("./sponsorTree");
const { audit } = require("./audit");
const { invalidateSearch } = require("./search");

async function createSponsor(input, userId, { force = false } = {}) {
  const v = validateNamedEntity(input, { cinAllowed: true });
  const type = parseType(input);
  const parentId = parseParentId(input);
  if (v.cin) {
    const existing = await query("SELECT id, full_name FROM sponsors WHERE cin_norm = ?", [v.cin]);
    if (existing[0]) throw new HttpError(409, `Ce CIN appartient déjà au parrain « ${existing[0].full_name} ».`, { existingId: existing[0].id });
  }
  if (!force) {
    const similar = (await searchSponsors(v.name, 5)).filter((s) => s.kind === "exact" || s.kind === "approx");
    if (similar.length) {
      throw new HttpError(409, "Un parrain similaire existe déjà.", {
        similar: similar.map((s) => ({ id: s.id, fullName: s.full_name, phone: s.phone, kind: s.kind, sponsorType: s.type, parentName: s.parent_name || null }))
      });
    }
  }
  const id = await withTransaction(async (tx) => {
    await assertParent((sql, params) => tx.query(sql + " LOCK IN SHARE MODE", params), type, parentId, null);
    const result = await tx.query(
      "INSERT INTO sponsors (full_name, name_norm, name_key, cin, cin_norm, phone, phone_norm, type, parent_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [v.name, v.nameNorm, v.nameKey, v.cin, v.cin, v.phone, v.phone, type, parentId]
    );
    return result.insertId;
  });
  invalidateSearch();
  await audit(null, userId, "sponsor.create", "sponsor", id, { name: v.name, type, parentId });
  return id;
}

async function updateSponsor(id, input, userId) {
  const v = validateNamedEntity(input, { cinAllowed: true });
  if (v.cin) {
    const existing = await query("SELECT id, full_name FROM sponsors WHERE cin_norm = ? AND id <> ?", [v.cin, id]);
    if (existing[0]) throw new HttpError(409, `Ce CIN appartient déjà au parrain « ${existing[0].full_name} ».`, { existingId: existing[0].id });
  }
  await withTransaction(async (tx) => {
    const current = await tx.query("SELECT id, type, parent_id FROM sponsors WHERE id = ? FOR UPDATE", [id]);
    if (!current[0]) throw new HttpError(404, "Parrain introuvable.");
    const type = parseType(input, current[0].type);
    const parentId = input.parentId === undefined ? current[0].parent_id : parseParentId(input);
    await assertParent((sql, params) => tx.query(sql + " LOCK IN SHARE MODE", params), type, parentId, id);
    await assertChangeAllowed((sql, params) => tx.query(sql, params), id, current[0], { type, parentId });
    await tx.query(
      "UPDATE sponsors SET full_name = ?, name_norm = ?, name_key = ?, cin = ?, cin_norm = ?, phone = ?, phone_norm = ?, type = ?, parent_id = ? WHERE id = ?",
      [v.name, v.nameNorm, v.nameKey, v.cin, v.cin, v.phone, v.phone, type, parentId, id]
    );
  });
  invalidateSearch();
  await audit(null, userId, "sponsor.update", "sponsor", id, { name: v.name });
}

async function createVendor(input, userId, { force = false } = {}) {
  const v = validateNamedEntity(input, { cinAllowed: false });
  const exact = await query("SELECT id, name FROM vendors WHERE name_norm = ?", [v.nameNorm]);
  if (exact[0]) throw new HttpError(409, `Le vendeur « ${exact[0].name} » existe déjà.`, { existingId: exact[0].id, similar: [{ id: exact[0].id, fullName: exact[0].name, kind: "exact" }] });
  if (!force) {
    const similar = (await searchVendors(v.name, 5)).filter((s) => s.kind === "approx");
    if (similar.length) {
      throw new HttpError(409, "Un vendeur similaire existe déjà.", {
        similar: similar.map((s) => ({ id: s.id, fullName: s.name, phone: s.phone, kind: s.kind }))
      });
    }
  }
  const result = await query(
    "INSERT INTO vendors (name, name_norm, name_key, phone, phone_norm) VALUES (?, ?, ?, ?, ?)",
    [v.name, v.nameNorm, v.nameKey, v.phone, v.phone]
  );
  invalidateSearch();
  await audit(null, userId, "vendor.create", "vendor", result.insertId, { name: v.name });
  return result.insertId;
}

async function updateVendor(id, input, userId) {
  const v = validateNamedEntity(input, { cinAllowed: false });
  const exact = await query("SELECT id, name FROM vendors WHERE name_norm = ? AND id <> ?", [v.nameNorm, id]);
  if (exact[0]) throw new HttpError(409, `Le vendeur « ${exact[0].name} » existe déjà.`);
  const isActive = input.isActive === undefined ? null : input.isActive ? 1 : 0;
  const result = await query(
    "UPDATE vendors SET name = ?, name_norm = ?, name_key = ?, phone = ?, phone_norm = ?, is_active = COALESCE(?, is_active) WHERE id = ?",
    [v.name, v.nameNorm, v.nameKey, v.phone, v.phone, isActive, id]
  );
  invalidateSearch();
  if (!result.affectedRows) throw new HttpError(404, "Vendeur introuvable.");
  await audit(null, userId, "vendor.update", "vendor", id, { name: v.name, isActive });
}

function formatSponsor(n, match) {
  return {
    id: n.id,
    fullName: n.name,
    cin: n.cin,
    phone: n.phone,
    type: n.type,
    canHaveFamilies: n.canHaveFamilies,
    parentId: n.parentId,
    parentName: n.parentName,
    ancestors: n.ancestors,
    subCount: n.subCount,
    familiesCount: n.families,
    membersCount: n.members,
    benefitedCount: n.benefited,
    kind: match
  };
}

async function listSponsors({ q, page, pageSize, offset, type }) {
  const { flat } = await sponsorTree();
  const byId = new Map(flat.map((n) => [n.id, n]));
  const wanted = type && PARENT_TYPES[type] ? type : null;
  if (q && String(q).trim()) {
    const found = await searchSponsors(q, 100);
    const items = found.filter((s) => byId.has(s.id) && (!wanted || s.type === wanted)).map((s) => formatSponsor(byId.get(s.id), s.kind));
    return { items: items.slice(offset, offset + pageSize), total: items.length };
  }
  const all = flat.filter((n) => !wanted || n.type === wanted).sort((a, b) => a.name.localeCompare(b.name));
  return { items: all.slice(offset, offset + pageSize).map((n) => formatSponsor(n)), total: all.length };
}

async function listVendors({ q, page, pageSize, offset, onlyActive }) {
  if (q && String(q).trim()) {
    const found = await searchVendors(q, 100, onlyActive);
    const items = found.map((v) => ({ id: v.id, name: v.name, phone: v.phone, isActive: Boolean(v.is_active), kind: v.kind }));
    return { items: items.slice(offset, offset + pageSize), total: items.length };
  }
  const where = onlyActive ? "WHERE v.is_active = 1" : "";
  const totalRow = await query(`SELECT COUNT(*) AS c FROM vendors v ${where}`);
  const rows = await query(
    `SELECT v.id, v.name, v.phone, v.is_active,
            (SELECT COUNT(*) FROM distribution_assignments a WHERE a.vendor_id = v.id) AS assigned
     FROM vendors v ${where} ORDER BY v.name LIMIT ? OFFSET ?`,
    [pageSize, offset]
  );
  return {
    items: rows.map((r) => ({ id: r.id, name: r.name, phone: r.phone, isActive: Boolean(r.is_active), assigned: r.assigned })),
    total: totalRow[0].c
  };
}

module.exports = { createSponsor, updateSponsor, createVendor, updateVendor, listSponsors, listVendors };
