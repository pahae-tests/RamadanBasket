const { route, intParam } = require("../../../lib/http");
const { eligibleFamilies } = require("../../../lib/distributions");
const { parseFamilyFilters } = require("../../../lib/families");

async function eligible(req, res) {
  const filters = parseFamilyFilters(req.query);
  const result = await eligibleFamilies(filters, {
    limit: intParam(req.query.limit, 50, 1, 500),
    offset: intParam(req.query.offset, 0, 0, 1000000),
    q: filters.q
  });
  res.status(200).json(result);
}

export default route({ GET: eligible });
