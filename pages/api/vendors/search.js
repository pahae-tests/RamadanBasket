const { route } = require("../../../lib/http");
const { searchVendors } = require("../../../lib/search");
const { query } = require("../../../lib/db");

async function search(req, res) {
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
  const onlyActive = req.query.onlyActive === "1" || req.query.onlyActive === "true";
  if (!q) {
    const rows = await query(`SELECT id, name, phone, is_active FROM vendors ${onlyActive ? "WHERE is_active = 1" : ""} ORDER BY name LIMIT 8`);
    res.status(200).json({ items: rows.map((v) => ({ id: v.id, name: v.name, phone: v.phone, isActive: Boolean(v.is_active), kind: "partial", score: 0 })) });
    return;
  }
  const rows = await searchVendors(q, 8, onlyActive);
  res.status(200).json({ items: rows.map((v) => ({ id: v.id, name: v.name, phone: v.phone, isActive: Boolean(v.is_active), kind: v.kind, score: v.score })) });
}

export default route({ GET: search });
