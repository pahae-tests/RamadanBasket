const { route } = require("../../../lib/http");
const { balancedAllocation } = require("../../../lib/distributions");
const { HttpError } = require("../../../lib/errors");

async function allocate(req, res) {
  const body = req.body || {};
  const total = Number.parseInt(body.total, 10);
  const vendorIds = Array.isArray(body.vendorIds) ? body.vendorIds.filter(Number.isInteger) : [];
  if (!Number.isInteger(total) || total < 0 || !vendorIds.length) throw new HttpError(400, "Paramètres invalides.");
  const weights = Array.isArray(body.weights) ? body.weights.map(Number) : null;
  if (weights && weights.some((w) => !Number.isFinite(w) || w < 0)) throw new HttpError(400, "Pondérations invalides.");
  res.status(200).json({ allocation: balancedAllocation(total, vendorIds, weights) });
}

export default route({ POST: allocate });
