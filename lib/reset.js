const { query, withTransaction } = require("./db");
const { HttpError } = require("./errors");
const { audit } = require("./audit");
const { normalizeName } = require("./normalize");

const PHRASES = { families: "REINITIALISER", history: "SUPPRIMER HISTORIQUE" };

async function resetPreview() {
  const [fam] = await query("SELECT COUNT(*) AS c FROM families");
  const [mem] = await query("SELECT COUNT(*) AS c FROM family_members");
  const [spo] = await query("SELECT COUNT(*) AS c FROM sponsors");
  const [ven] = await query("SELECT COUNT(*) AS c FROM vendors");
  const [dis] = await query("SELECT COUNT(*) AS c FROM distributions");
  const [ass] = await query("SELECT COUNT(*) AS c FROM distribution_assignments");
  const [usr] = await query("SELECT COUNT(*) AS c FROM users");
  return {
    families: { families: fam.c, members: mem.c, sponsors: spo.c },
    retained: { vendors: ven.c, distributions: dis.c, assignments: ass.c, users: usr.c },
    history: { distributions: dis.c, assignments: ass.c },
    phrases: { families: "RÉINITIALISER", history: "SUPPRIMER L'HISTORIQUE" }
  };
}

function phraseMatches(scope, typed) {
  return normalizeName(typed).toUpperCase() === PHRASES[scope];
}

async function resetData(scope, confirmation, userId) {
  if (!PHRASES[scope]) throw new HttpError(400, "Portée de réinitialisation inconnue.");
  if (!phraseMatches(scope, confirmation)) throw new HttpError(400, "La phrase de confirmation est incorrecte.");
  return withTransaction(async (tx) => {
    const lock = await tx.query("SELECT GET_LOCK('rbm_reset', 0) AS got");
    if (!lock[0].got) throw new HttpError(409, "Une opération est déjà en cours.");
    try {
      const admins = await tx.query("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND is_active = 1");
      if (admins[0].c < 1) throw new HttpError(409, "Aucun administrateur actif : opération refusée.");
      let result;
      if (scope === "families") {
        const members = await tx.query("DELETE FROM family_members");
        const families = await tx.query("DELETE FROM families");
        await tx.query("UPDATE sponsors SET parent_id = NULL");
        const sponsors = await tx.query("DELETE FROM sponsors");
        result = { deletedMembers: members.affectedRows, deletedFamilies: families.affectedRows, deletedSponsors: sponsors.affectedRows };
      } else {
        const assignments = await tx.query("DELETE FROM distribution_assignments");
        const distributions = await tx.query("DELETE FROM distributions");
        result = { deletedAssignments: assignments.affectedRows, deletedDistributions: distributions.affectedRows };
      }
      await audit(tx, userId, `reset.${scope}`, "system", null, result);
      return result;
    } finally {
      await tx.query("SELECT RELEASE_LOCK('rbm_reset')");
    }
  });
}

module.exports = { resetPreview, resetData };
