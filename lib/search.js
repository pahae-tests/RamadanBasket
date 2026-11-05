const { query } = require("./db");
const { PARENT_TYPES, SCOPE_SQL, scopeParams, canHaveFamilies } = require("./sponsorRules");
const { normalizeCin, normalizePhone, scoreName, prepareName } = require("./normalize");

const TTL_MS = 8000;
const MAX_ROWS = 100000;
const cache = new Map();

function invalidateSearch() {
  cache.clear();
}

async function loadIndex(name, sql, nameField) {
  const hit = cache.get(name);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise;
  const promise = query(`${sql} LIMIT ${MAX_ROWS}`).then((rows) => rows.map((r) => ({ ...r, prep: prepareName(r[nameField]) })));
  cache.set(name, { at: Date.now(), promise });
  promise.catch(() => cache.delete(name));
  return promise;
}

function classify(raw) {
  const text = String(raw || "").trim();
  const cin = normalizeCin(text);
  if (cin && /^[A-Z]{1,2}\d{3,8}$/.test(cin)) return { type: "cin", cin };
  const digits = text.replace(/[\s.\-+]/g, "");
  if (/^\d{4,}$/.test(digits)) return { type: "phone", digits: normalizePhone(text) || digits };
  return { type: "name" };
}

function rank(rows, nameField, limit) {
  rows.sort((a, b) => b.score - a.score || String(a[nameField]).localeCompare(String(b[nameField])));
  return rows.slice(0, limit).map(({ prep, ...rest }) => rest);
}

function scoreRows(rows, text, kind, nameField, cinField, phoneField) {
  const out = [];
  if (kind.type === "cin") {
    for (const r of rows) {
      const v = r[cinField];
      if (!v || !v.startsWith(kind.cin)) continue;
      out.push({ ...r, score: v === kind.cin ? 100 : 70, kind: v === kind.cin ? "exact" : "partial" });
    }
    return out;
  }
  if (kind.type === "phone") {
    for (const r of rows) {
      const v = r[phoneField];
      if (!v || !v.includes(kind.digits)) continue;
      out.push({ ...r, score: v === kind.digits ? 100 : 70, kind: v === kind.digits ? "exact" : "partial" });
    }
    return out;
  }
  const q = prepareName(text);
  for (const r of rows) {
    const { score, kind: k } = scoreName(q, r.prep);
    if (score > 0) out.push({ ...r, score, kind: k });
  }
  return out;
}

function sponsorPool(rows, { types = null, parentFor = null, familiesOnly = false } = {}) {
  let pool = rows;
  if (types && types.length) pool = pool.filter((r) => types.includes(r.type));
  if (parentFor) pool = pool.filter((r) => PARENT_TYPES[parentFor] && PARENT_TYPES[parentFor].includes(r.type));
  if (familiesOnly) pool = pool.filter((r) => canHaveFamilies(r.type));
  return pool;
}

async function searchSponsors(q, limit = 10, options = {}) {
  const text = String(q || "").trim();
  if (!text) return [];
  const rows = await loadIndex(
    "sponsors",
    "SELECT s.id, s.full_name, s.cin, s.cin_norm, s.phone, s.phone_norm, s.type, s.parent_id, p.full_name AS parent_name FROM sponsors s LEFT JOIN sponsors p ON p.id = s.parent_id",
    "full_name"
  );
  return rank(scoreRows(sponsorPool(rows, options), text, classify(text), "full_name", "cin_norm", "phone_norm"), "full_name", limit);
}

async function searchVendors(q, limit = 10, onlyActive = false) {
  const text = String(q || "").trim();
  if (!text) return [];
  const rows = await loadIndex("vendors", "SELECT id, name, phone, phone_norm, is_active FROM vendors", "name");
  const pool = onlyActive ? rows.filter((r) => r.is_active) : rows;
  return rank(scoreRows(pool, text, classify(text), "name", "cin_norm", "phone_norm"), "name", limit);
}

async function searchFamilies(q, { limit = 20, sponsorId = null, excludeIds = [] } = {}) {
  const text = String(q || "").trim();
  if (!text) return [];
  const kind = classify(text);
  const rows = await loadIndex(
    "members",
    `SELECT m.id, m.family_id, m.full_name, m.cin_norm, m.phone_norm, m.is_representative, f.sponsor_id, f.phone_norm AS family_phone
     FROM family_members m JOIN families f ON f.id = m.family_id`,
    "full_name"
  );
  const excluded = new Set(excludeIds.map(Number));
  let pool = rows;
  if (sponsorId) {
    const own = await query(`SELECT id FROM sponsors WHERE id IN ${SCOPE_SQL}`, scopeParams(sponsorId));
    const allowed = new Set(own.map((r) => r.id));
    pool = pool.filter((r) => allowed.has(r.sponsor_id));
  }
  if (excluded.size) pool = pool.filter((r) => !excluded.has(r.family_id));
  let scored;
  if (kind.type === "phone") {
    scored = [];
    for (const r of pool) {
      const hit = (r.phone_norm && r.phone_norm.includes(kind.digits)) || (r.family_phone && r.family_phone.includes(kind.digits));
      if (!hit) continue;
      const exact = r.phone_norm === kind.digits || r.family_phone === kind.digits;
      scored.push({ ...r, score: exact ? 100 : 70, kind: exact ? "exact" : "partial" });
    }
  } else {
    scored = scoreRows(pool, text, kind, "full_name", "cin_norm", "phone_norm");
  }
  const best = new Map();
  for (const row of scored) {
    const total = row.score + (row.is_representative ? 1 : 0);
    const current = best.get(row.family_id);
    if (!current || total > current.score) {
      best.set(row.family_id, { familyId: row.family_id, score: total, kind: row.kind, matchedName: row.full_name, matchedIsRepresentative: Boolean(row.is_representative) });
    }
  }
  const top = [...best.values()].sort((a, b) => b.score - a.score || a.familyId - b.familyId).slice(0, limit);
  if (!top.length) return [];
  const families = await query(
    `SELECT f.id, f.phone, f.sponsor_id, s.full_name AS sponsor_name, ps.full_name AS sponsor_parent_name, r.full_name AS representative_name, r.cin AS representative_cin,
            (SELECT COUNT(*) FROM family_members x WHERE x.family_id = f.id) AS members_count
     FROM families f
     LEFT JOIN sponsors s ON s.id = f.sponsor_id
     LEFT JOIN sponsors ps ON ps.id = s.parent_id
     LEFT JOIN family_members r ON r.family_id = f.id AND r.is_representative = 1
     WHERE f.id IN (?)`,
    [top.map((t) => t.familyId)]
  );
  const byId = new Map(families.map((f) => [f.id, f]));
  return top
    .map((t) => {
      const f = byId.get(t.familyId);
      if (!f) return null;
      return {
        id: f.id,
        representativeName: f.representative_name,
        representativeCin: f.representative_cin,
        phone: f.phone,
        sponsorId: f.sponsor_id,
        sponsorName: f.sponsor_name,
        sponsorParentName: f.sponsor_parent_name || null,
        membersCount: f.members_count,
        matchedName: t.matchedName,
        matchedIsRepresentative: t.matchedIsRepresentative,
        score: t.score,
        kind: t.kind
      };
    })
    .filter(Boolean);
}

function escapeLike(text) {
  return String(text).replace(/[\\%_]/g, (c) => "\\" + c);
}

module.exports = { sponsorPool, searchFamilies, searchSponsors, searchVendors, classify, escapeLike, invalidateSearch };
