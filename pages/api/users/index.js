const { route, pageParams } = require("../../../lib/http");
const { listUsers, createUser } = require("../../../lib/users");

async function list(req, res) {
  const q = typeof req.query.q === "string" ? req.query.q.slice(0, 80) : "";
  res.status(200).json(await listUsers({ q, ...pageParams(req.query) }));
}

async function create(req, res, user) {
  const id = await createUser(req.body || {}, user.id);
  res.status(201).json({ id });
}

export default route({ GET: list, POST: create }, { admin: true });
