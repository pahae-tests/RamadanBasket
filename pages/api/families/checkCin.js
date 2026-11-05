const { route } = require("../../../lib/http");
const { checkCin } = require("../../../lib/families");

async function check(req, res) {
  const exclude = Number.parseInt(req.query.excludeFamilyId, 10);
  const result = await checkCin(req.query.cin, Number.isInteger(exclude) ? exclude : null);
  res.status(200).json(result);
}

export default route({ GET: check });
