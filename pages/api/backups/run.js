const { route } = require("../../../lib/http");
const { runBackup } = require("../../../lib/backup");
const { audit } = require("../../../lib/audit");

export const config = { api: { responseLimit: false }, maxDuration: 60 };

async function run(req, res, user) {
  const outcome = await runBackup();
  await audit(null, user.id, "backup.manualRun", "backup", outcome.body.executionId || null, { status: outcome.body.status });
  res.status(outcome.httpStatus === 409 ? 409 : 200).json(outcome.body);
}

export default route({ POST: run }, { admin: true });
