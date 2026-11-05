const { route, idParam } = require("../../../lib/http");
const { getFamily, updateFamily, deleteFamily } = require("../../../lib/families");

async function get(req, res) {
  res.status(200).json(await getFamily(idParam(req.query.id)));
}

async function update(req, res, user) {
  const id = idParam(req.query.id);
  await updateFamily(id, req.body, user.id);
  res.status(200).json({ ok: true });
}

async function remove(req, res, user) {
  await deleteFamily(idParam(req.query.id), user.id);
  res.status(200).json({ ok: true });
}

export default route({ GET: get, PUT: update, DELETE: remove });
