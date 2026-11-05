const { route } = require("../../../lib/http");
const { familyDirectory, parseFamilyFilters } = require("../../../lib/families");

async function directory(req, res) {
  res.status(200).json({ groups: await familyDirectory(parseFamilyFilters(req.query)) });
}

export default route({ GET: directory });
