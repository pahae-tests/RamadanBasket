const { route } = require("../../../lib/http");
const { autoSelect } = require("../../../lib/distributions");
const { parseFamilyFilters } = require("../../../lib/families");

async function select(req, res) {
  const body = req.body || {};
  const count = Number.parseInt(body.count, 10);
  const filters = parseFamilyFilters(body.filters || {});
  const exclude = Array.isArray(body.excludeIds) ? body.excludeIds.filter(Number.isInteger) : [];
  res.status(200).json(await autoSelect(count, filters, exclude));
}

export default route({ POST: select });
