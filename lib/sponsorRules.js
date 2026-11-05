const { HttpError } = require("./errors");

const { TYPES, TYPE_LABELS, TYPE_PLURALS, CHILD_TYPES, PARENT_TYPES } = require("./sponsorTypes");

const PARENT_REQUIRED = { group: false, classic: false, special: false, sub: true };

const FAMILY_TYPES = ["classic", "sub"];

const SCOPE_SQL = "(SELECT id FROM sponsors WHERE id = ? OR parent_id = ? OR parent_id IN (SELECT id FROM sponsors WHERE parent_id = ?))";

function scopeParams(id) {
  return [id, id, id];
}

function canHaveFamilies(type) {
  return FAMILY_TYPES.includes(type);
}

function canHaveChildren(type) {
  return CHILD_TYPES[type] && CHILD_TYPES[type].length > 0;
}

function parseType(input, fallback = "classic") {
  const raw = input && input.type !== undefined && input.type !== null && input.type !== "" ? input.type : fallback;
  if (!TYPES.includes(raw)) throw new HttpError(400, "Données invalides.", { type: "Type de parrain invalide." });
  return raw;
}

function parseParentId(input) {
  const raw = input ? input.parentId : null;
  if (raw === null || raw === undefined || raw === "") return null;
  const parentId = Number.parseInt(raw, 10);
  if (!Number.isInteger(parentId) || parentId <= 0) throw new HttpError(400, "Données invalides.", { parentId: "Rattachement invalide." });
  return parentId;
}

function parentMessage(type) {
  if (type === "sub") return "Un sous-parrain doit être rattaché à un parrain spécial.";
  if (type === "group") return "Un super-parrain ne peut pas être rattaché à un autre parrain.";
  return "Un parrain classique ou spécial ne peut être rattaché qu'à un super-parrain.";
}

async function assertParent(run, type, parentId, selfId) {
  if (!parentId) {
    if (PARENT_REQUIRED[type]) throw new HttpError(400, "Données invalides.", { parentId: parentMessage(type) });
    return;
  }
  if (PARENT_TYPES[type].length === 0) throw new HttpError(400, "Données invalides.", { parentId: parentMessage(type) });
  if (selfId && parentId === selfId) throw new HttpError(400, "Données invalides.", { parentId: "Un parrain ne peut pas être rattaché à lui-même." });
  const rows = await run("SELECT id, type FROM sponsors WHERE id = ?", [parentId]);
  if (!rows[0]) throw new HttpError(400, "Données invalides.", { parentId: "Parrain de rattachement introuvable." });
  if (!PARENT_TYPES[type].includes(rows[0].type)) throw new HttpError(400, "Données invalides.", { parentId: parentMessage(type) });
}

async function assertChangeAllowed(run, id, current, next) {
  if (!canHaveFamilies(next.type)) {
    const used = await run("SELECT COUNT(*) AS c FROM families WHERE sponsor_id = ?", [id]);
    if (used[0].c > 0) throw new HttpError(409, `Ce parrain a des familles : il ne peut pas devenir ${TYPE_LABELS[next.type].toLowerCase()}. Déplacez d'abord ses familles.`);
  }
  const kids = await run("SELECT type FROM sponsors WHERE parent_id = ?", [id]);
  if (kids.length) {
    const allowed = CHILD_TYPES[next.type];
    const bad = kids.find((k) => !allowed.includes(k.type));
    if (bad) {
      throw new HttpError(409, `Ce parrain a des ${TYPE_PLURALS[bad.type]} rattachés : le type « ${TYPE_LABELS[next.type]} » les interdit. Détachez-les d'abord.`);
    }
  }
}

module.exports = { TYPES, TYPE_LABELS, CHILD_TYPES, PARENT_TYPES, FAMILY_TYPES, SCOPE_SQL, scopeParams, canHaveFamilies, canHaveChildren, parseType, parseParentId, assertParent, assertChangeAllowed };
