const { route } = require("../../../../lib/http");
const { validateImport } = require("../../../../lib/importer");

export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };

async function validate(req, res) {
  const { rows, mapping, mode } = req.body || {};
  const result = await validateImport({ rows, mapping, mode });
  res.status(200).json({ errors: result.errors.slice(0, 2000), warnings: result.warnings.slice(0, 2000), errorTotal: result.errors.length, warningTotal: result.warnings.length, summary: result.summary });
}

export default route({ POST: validate }, { admin: true });
