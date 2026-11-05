const { route, pageParams } = require("../../../lib/http");
const { createSponsor, listSponsors } = require("../../../lib/entities");

async function list(req, res) {
  const q = typeof req.query.q === "string" ? req.query.q.slice(0, 100) : "";
  res.status(200).json(await listSponsors({ q, type: typeof req.query.type === "string" ? req.query.type : "", ...pageParams(req.query) }));
}

async function create(req, res, user) {
  const force = Boolean(req.body && req.body.force);
  const id = await createSponsor(req.body, user.id, { force });
  res.status(201).json({ id });
}

export default route({ GET: list, POST: create });
