const { route } = require("../../../lib/http");

async function me(req, res, user, session) {
  res.status(200).json({ user, csrf: session.csrf });
}

export default route({ GET: me });
