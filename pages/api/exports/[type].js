const { route } = require("../../../lib/http");
const { buildExport, buildExportFilename } = require("../../../lib/excel");
const { todayCasablanca } = require("../../../lib/distributions");

async function download(req, res) {
  const type = String(req.query.type);
  const workbook = await buildExport(type, req.query);
  const filename = await buildExportFilename(type, req.query, todayCasablanca());
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
}

export default route({ GET: download });
