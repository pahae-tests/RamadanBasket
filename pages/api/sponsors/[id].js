const { route, idParam } = require("../../../lib/http");
const { canHaveFamilies } = require("../../../lib/sponsorRules");
const { updateSponsor } = require("../../../lib/entities");
const { query } = require("../../../lib/db");
const { HttpError } = require("../../../lib/errors");
const { audit } = require("../../../lib/audit");
const { invalidateSearch } = require("../../../lib/search");

async function get(req, res) {
  const rows = await query(
    "SELECT s.id, s.full_name, s.cin, s.phone, s.type, s.parent_id, p.full_name AS parent_name FROM sponsors s LEFT JOIN sponsors p ON p.id = s.parent_id WHERE s.id = ?",
    [idParam(req.query.id)]
  );
  if (!rows[0]) throw new HttpError(404, "Parrain introuvable.");
  const r = rows[0];
  res.status(200).json({ id: r.id, fullName: r.full_name, cin: r.cin, phone: r.phone, type: r.type, canHaveFamilies: canHaveFamilies(r.type), parentId: r.parent_id, parentName: r.parent_name });
}

async function update(req, res, user) {
  await updateSponsor(idParam(req.query.id), req.body, user.id);
  res.status(200).json({ ok: true });
}

async function remove(req, res, user) {
  const id = idParam(req.query.id);
  const used = await query("SELECT COUNT(*) AS c FROM families WHERE sponsor_id = ?", [id]);
  if (used[0].c > 0) throw new HttpError(409, "Ce parrain a des familles associées : suppression impossible.");
  const kids = await query("SELECT COUNT(*) AS c FROM sponsors WHERE parent_id = ?", [id]);
  if (kids[0].c > 0) throw new HttpError(409, "Ce parrain a des parrains ou sous-parrains rattachés : suppression impossible.");
  const result = await query("DELETE FROM sponsors WHERE id = ?", [id]);
  if (!result.affectedRows) throw new HttpError(404, "Parrain introuvable.");
  invalidateSearch();
  await audit(null, user.id, "sponsor.delete", "sponsor", id, null);
  res.status(200).json({ ok: true });
}

export default route({ GET: get, PUT: update, DELETE: remove });
