const { route } = require("../../../lib/http");
const { searchSponsors, sponsorPool } = require("../../../lib/search");
const { query } = require("../../../lib/db");
const { TYPES, canHaveFamilies } = require("../../../lib/sponsorRules");

function shape(s, kind, score) {
  return {
    id: s.id,
    fullName: s.full_name,
    phone: s.phone,
    cin: s.cin,
    type: s.type,
    canHaveFamilies: canHaveFamilies(s.type),
    parentId: s.parent_id || null,
    parentName: s.parent_name || null,
    kind,
    score
  };
}

function parseOptions(q) {
  const types = typeof q.types === "string" ? q.types.split(",").filter((t) => TYPES.includes(t)) : [];
  return {
    types,
    parentFor: typeof q.parentFor === "string" && TYPES.includes(q.parentFor) ? q.parentFor : null,
    familiesOnly: q.familiesOnly === "1"
  };
}

async function search(req, res) {
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
  const options = parseOptions(req.query);
  if (!q) {
    const rows = await query("SELECT s.id, s.full_name, s.phone, s.cin, s.type, s.parent_id, p.full_name AS parent_name FROM sponsors s LEFT JOIN sponsors p ON p.id = s.parent_id ORDER BY s.full_name LIMIT 500");
    res.status(200).json({ items: sponsorPool(rows, options).slice(0, 8).map((s) => shape(s, "partial", 0)) });
    return;
  }
  const rows = await searchSponsors(q, 8, options);
  res.status(200).json({ items: rows.map((s) => shape(s, s.kind, s.score)) });
}

export default route({ GET: search });
