const { route, pageParams } = require("../../../lib/http");
const { createFamily, listFamilies, parseFamilyFilters } = require("../../../lib/families");

async function list(req, res) {
  const filters = parseFamilyFilters(req.query);
  const result = await listFamilies(filters, pageParams(req.query));
  res.status(200).json(result);
}

async function create(req, res, user) {
  const id = await createFamily(req.body, user.id);
  res.status(201).json({ id });
}

export default route({ GET: list, POST: create });
