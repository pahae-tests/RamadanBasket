const { route } = require("../../lib/http");
const { findings } = require("../../lib/dataQuality");

async function quality(req, res) {
  res.status(200).json(await findings());
}

export default route({ GET: quality });
