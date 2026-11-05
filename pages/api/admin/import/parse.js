const { route } = require("../../../../lib/http");
const { parseWorkbook, FIELDS } = require("../../../../lib/importer");
const { HttpError } = require("../../../../lib/errors");

export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };

const MAX_BYTES = 3 * 1024 * 1024;

async function parse(req, res) {
  const body = req.body || {};
  const filename = typeof body.filename === "string" ? body.filename.slice(0, 200) : "";
  if (!/\.xlsx$/i.test(filename)) throw new HttpError(400, "Seuls les fichiers .xlsx sont acceptés.");
  if (typeof body.contentBase64 !== "string" || !body.contentBase64) throw new HttpError(400, "Fichier manquant.");
  const buffer = Buffer.from(body.contentBase64, "base64");
  if (buffer.length > MAX_BYTES) throw new HttpError(413, "Fichier trop volumineux (3 Mo maximum).");
  const result = await parseWorkbook(buffer);
  res.status(200).json({ ...result, fields: FIELDS.map((f) => ({ key: f.key, label: f.label, required: f.required })) });
}

export default route({ POST: parse }, { admin: true });
