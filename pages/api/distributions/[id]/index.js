const { route, idParam } = require("../../../../lib/http");
const { getDistribution, deleteDistribution } = require("../../../../lib/distributions");

async function get(req, res) {
  const vendorId = Number.parseInt(req.query.vendorId, 10);
  const result = await getDistribution(idParam(req.query.id), {
    vendorId: Number.isInteger(vendorId) ? vendorId : null,
    q: typeof req.query.q === "string" ? req.query.q.slice(0, 100) : ""
  });
  res.status(200).json(result);
}

async function remove(req, res, user) {
  if (user.role !== "admin") {
    const { HttpError } = require("../../../../lib/errors");
    throw new HttpError(403, "Seul un administrateur peut supprimer une distribution.");
  }
  await deleteDistribution(idParam(req.query.id), user.id);
  res.status(200).json({ ok: true });
}

export default route({ GET: get, DELETE: remove });
