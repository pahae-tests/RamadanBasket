const { route } = require("../../../lib/http");
const { searchFamilies } = require("../../../lib/search");

async function search(req, res) {
  const q = typeof req.query.q === "string" ? req.query.q.slice(0, 100) : "";
  const sponsorId = Number.parseInt(req.query.sponsorId, 10);
  const items = await searchFamilies(q, { limit: 15, sponsorId: Number.isInteger(sponsorId) ? sponsorId : null });
  res.status(200).json({ items });
}

export default route({ GET: search });
