const { route } = require("../../lib/http");
const { globalStats, dailyStats, sponsorStats, vendorStats } = require("../../lib/stats");
const { query } = require("../../lib/db");

async function dashboard(req, res) {
  const [global, daily, sponsorData, vendors] = await Promise.all([globalStats({}), dailyStats({}), sponsorStats({}), vendorStats({})]);
  const sponsors = sponsorData.flat.filter((s) => s.canHaveFamilies);
  const latest = await query(
    `SELECT d.id, d.distribution_date AS date, COUNT(a.id) AS families FROM distributions d LEFT JOIN distribution_assignments a ON a.distribution_id = d.id
     GROUP BY d.id ORDER BY d.distribution_date DESC, d.id DESC LIMIT 5`
  );
  res.status(200).json({
    global,
    recent: daily.days.slice(-14),
    latest: latest.map((r) => ({ id: r.id, date: r.date, families: Number(r.families) })),
    topSponsors: [...sponsors].sort((a, b) => b.waiting - a.waiting).slice(0, 5),
    vendors: vendors.slice(0, 6)
  });
}

export default route({ GET: dashboard });
