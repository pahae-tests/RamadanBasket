const { route, idParam } = require("../../../lib/http");
const { updateVendor } = require("../../../lib/entities");

async function update(req, res, user) {
  await updateVendor(idParam(req.query.id), req.body, user.id);
  res.status(200).json({ ok: true });
}

export default route({ PUT: update });
