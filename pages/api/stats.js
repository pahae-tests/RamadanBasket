const { route } = require("../../lib/http");
const { allStats, parseStatsFilters } = require("../../lib/stats");

async function stats(req, res) {
  res.status(200).json(await allStats(parseStatsFilters(req.query)));
}

export default route({ GET: stats });
