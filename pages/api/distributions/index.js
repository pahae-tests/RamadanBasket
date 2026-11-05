const { route, pageParams } = require("../../../lib/http");
const { createDistribution, listDistributions } = require("../../../lib/distributions");

async function list(req, res) {
  res.status(200).json(await listDistributions(pageParams(req.query)));
}

async function create(req, res, user) {
  const id = await createDistribution(req.body, user.id);
  res.status(201).json({ id });
}

export default route({ GET: list, POST: create });
