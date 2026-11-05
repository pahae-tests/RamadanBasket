const { route } = require("../../../../lib/http");
const { templateWorkbook } = require("../../../../lib/importer");

async function template(req, res) {
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="modeleImport.xlsx"');
  await templateWorkbook().xlsx.write(res);
  res.end();
}

export default route({ GET: template }, { admin: true });
