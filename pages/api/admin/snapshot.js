const { route } = require("../../../lib/http");
const { buildSnapshotWorkbook } = require("../../../lib/excel");
const { todayCasablanca } = require("../../../lib/distributions");
const { audit } = require("../../../lib/audit");

async function snapshot(req, res, user) {
  const workbook = await buildSnapshotWorkbook();
  await audit(null, user.id, "snapshot.download", "system", null, null);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="instantane-${todayCasablanca()}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}

export default route({ GET: snapshot }, { admin: true });
