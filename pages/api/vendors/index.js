const { route, pageParams } = require("../../../lib/http");
const { createVendor, listVendors } = require("../../../lib/entities");

async function list(req, res) {
  const q = typeof req.query.q === "string" ? req.query.q.slice(0, 100) : "";
  res.status(200).json(await listVendors({ q, onlyActive: req.query.onlyActive === "1", ...pageParams(req.query) }));
}

async function create(req, res, user) {
  const force = Boolean(req.body && req.body.force);
  const id = await createVendor(req.body, user.id, { force });
  res.status(201).json({ id });
}

export default route({ GET: list, POST: create });
