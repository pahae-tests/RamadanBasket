const { route, idParam } = require("../../../lib/http");
const { downloadInfo } = require("../../../lib/backup");
const storage = require("../../../lib/storage");
const { HttpError } = require("../../../lib/errors");
const { audit } = require("../../../lib/audit");

async function download(req, res, user) {
  const type = req.query.type === "sql" ? "sql" : req.query.type === "excel" ? "excel" : null;
  if (!type) throw new HttpError(400, "Type de fichier invalide.");
  if (!storage.isConfigured()) throw new HttpError(503, "Stockage de sauvegarde non configuré.");
  const info = await downloadInfo(idParam(req.query.id), type);
  if (!info) throw new HttpError(404, "Aucun fichier disponible pour cette sauvegarde.");
  const url = await storage.signedDownloadUrl(info.key, info.filename);
  await audit(null, user.id, "backup.download", "backup", req.query.id, { type });
  res.status(200).json({ url, expiresInSeconds: 60 });
}

export default route({ GET: download }, { admin: true });
