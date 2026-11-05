const { route, idParam } = require("../../../lib/http");
const { reassignAssignment } = require("../../../lib/distributions");
const { HttpError } = require("../../../lib/errors");

async function patch(req, res, user) {
  const vendorId = Number.parseInt((req.body || {}).vendorId, 10);
  if (!Number.isInteger(vendorId)) throw new HttpError(400, "Vendeur invalide.");
  await reassignAssignment(idParam(req.query.id), vendorId, user.id);
  res.status(200).json({ ok: true });
}

export default route({ PATCH: patch });
