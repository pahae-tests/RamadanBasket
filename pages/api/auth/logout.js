const { route } = require("../../../lib/http");
const { destroySession, buildCookie } = require("../../../lib/auth");

async function logout(req, res) {
  await destroySession(req);
  res.setHeader("Set-Cookie", buildCookie("", 0));
  res.status(200).json({ ok: true });
}

export default route({ POST: logout });
