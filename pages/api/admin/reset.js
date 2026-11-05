const { route } = require("../../../lib/http");
const { resetPreview, resetData } = require("../../../lib/reset");

async function preview(req, res) {
  res.status(200).json(await resetPreview());
}

async function reset(req, res, user) {
  const body = req.body || {};
  res.status(200).json(await resetData(body.scope, String(body.confirmation || ""), user.id));
}

export default route({ GET: preview, POST: reset }, { admin: true });
