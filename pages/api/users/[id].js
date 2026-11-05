const { route, idParam } = require("../../../lib/http");
const { updateUser, resetPassword, deleteUser } = require("../../../lib/users");
const { HttpError } = require("../../../lib/errors");

async function update(req, res, user) {
  const id = idParam(req.query.id);
  const body = req.body || {};
  if (id === user.id && (body.role !== "admin" || body.isActive === false)) {
    throw new HttpError(409, "Vous ne pouvez pas retirer vos propres droits ni désactiver votre compte.");
  }
  await updateUser(id, body, user.id);
  res.status(200).json({ ok: true });
}

async function reset(req, res, user) {
  await resetPassword(idParam(req.query.id), (req.body || {}).password, user.id);
  res.status(200).json({ ok: true });
}

async function remove(req, res, user) {
  await deleteUser(idParam(req.query.id), user.id);
  res.status(200).json({ ok: true });
}

export default route({ PUT: update, POST: reset, DELETE: remove }, { admin: true });
