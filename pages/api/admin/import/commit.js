const { route } = require("../../../../lib/http");
const { commitImport } = require("../../../../lib/importer");
const { HttpError } = require("../../../../lib/errors");

export const config = { api: { bodyParser: { sizeLimit: "4mb" } }, maxDuration: 60 };

async function commit(req, res, user) {
  const body = req.body || {};
  if (body.mode === "replace" && body.confirmation !== "REMPLACER") {
    throw new HttpError(400, "Tapez REMPLACER pour confirmer le mode remplacement.");
  }
  const result = await commitImport(body, user.id);
  res.status(200).json(result);
}

export default route({ POST: commit }, { admin: true });
