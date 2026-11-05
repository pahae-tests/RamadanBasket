const { route } = require("../../../../lib/http");
const { errorReportWorkbook } = require("../../../../lib/importer");

export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };

async function report(req, res) {
  const { errors, warnings } = req.body || {};
  const workbook = errorReportWorkbook(Array.isArray(errors) ? errors.slice(0, 5000) : [], Array.isArray(warnings) ? warnings.slice(0, 5000) : []);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="rapportErreursImport.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
}

export default route({ POST: report }, { admin: true });
