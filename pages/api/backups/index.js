const { route } = require("../../../lib/http");
const { listRuns } = require("../../../lib/backup");
const storage = require("../../../lib/storage");

async function list(req, res) {
  res.status(200).json({ items: await listRuns(100), storageConfigured: storage.isConfigured(), missing: storage.missingConfig() });
}

export default route({ GET: list }, { admin: true });
