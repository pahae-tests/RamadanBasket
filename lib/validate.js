const { HttpError } = require("./errors");
const { cleanText, normalizeCin, isValidCin, normalizePhone, isValidPhone, normalizeName, nameKey } = require("./normalize");

function fail(errors) {
  throw new HttpError(400, "Données invalides.", errors);
}

function personFields(raw, label, errors, { requireName = true, requireCin = false } = {}) {
  const fullName = cleanText(raw && raw.fullName, 160);
  if (requireName && (!fullName || fullName.length < 2)) errors[`${label}.fullName`] = "Le nom complet est obligatoire.";
  const cin = normalizeCin(raw && raw.cin);
  if (requireCin && !cin) errors[`${label}.cin`] = "Le CIN est obligatoire.";
  else if (cin && !isValidCin(cin)) errors[`${label}.cin`] = "Format de CIN invalide (ex. AB123456).";
  const phone = normalizePhone(raw && raw.phone);
  if (phone && !isValidPhone(phone)) errors[`${label}.phone`] = "Numéro invalide : 10 chiffres commençant par 05, 06 ou 07.";
  return {
    fullName,
    cin: cin || null,
    phone: phone || null
  };
}

function validateFamilyInput(input) {
  const errors = {};
  if (!input || typeof input !== "object") fail({ form: "Corps de requête invalide." });
  const representative = personFields(input.representative, "representative", errors, { requireCin: true });
  const members = [];
  const rawMembers = Array.isArray(input.members) ? input.members : [];
  if (rawMembers.length > 40) errors.members = "Trop de membres (40 maximum).";
  rawMembers.forEach((m, index) => {
    const parsed = personFields(m, `members.${index}`, errors);
    members.push({ id: m && Number.isInteger(m.id) ? m.id : null, ...parsed });
  });
  let sponsorId = null;
  if (input.sponsorId === null || input.sponsorId === undefined || input.sponsorId === "") {
    errors.sponsorId = "Le parrain est obligatoire.";
  } else {
    sponsorId = Number.parseInt(input.sponsorId, 10);
    if (!Number.isInteger(sponsorId) || sponsorId <= 0) errors.sponsorId = "Parrain invalide.";
  }
  const seen = new Map();
  const all = [{ label: "representative", cin: representative.cin }, ...members.map((m, i) => ({ label: `members.${i}`, cin: m.cin }))];
  for (const entry of all) {
    if (!entry.cin) continue;
    if (seen.has(entry.cin)) {
      errors[`${entry.label}.cin`] = "Ce CIN apparaît deux fois dans la même famille.";
      errors[`${seen.get(entry.cin)}.cin`] = "Ce CIN apparaît deux fois dans la même famille.";
    } else {
      seen.set(entry.cin, entry.label);
    }
  }
  if (Object.keys(errors).length) fail(errors);
  return {
    representative,
    members,
    sponsorId,
    phone: representative.phone,
    address: cleanText(input.address, 255)
  };
}

function validateNamedEntity(input, { cinAllowed }) {
  const errors = {};
  if (!input || typeof input !== "object") fail({ form: "Corps de requête invalide." });
  const name = cleanText(input.fullName !== undefined ? input.fullName : input.name, 160);
  if (!name || name.length < 2) errors.name = "Le nom est obligatoire.";
  const phone = normalizePhone(input.phone);
  if (phone && !isValidPhone(phone)) errors.phone = "Numéro invalide : 10 chiffres commençant par 05, 06 ou 07.";
  let cin = null;
  if (cinAllowed) {
    cin = normalizeCin(input.cin);
    if (cin && !isValidCin(cin)) errors.cin = "Format de CIN invalide (ex. AB123456).";
  }
  if (Object.keys(errors).length) fail(errors);
  return {
    name,
    nameNorm: normalizeName(name),
    nameKey: nameKey(name),
    phone: phone || null,
    cin: cin || null
  };
}

function validateDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(value + "T00:00:00Z");
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) return null;
  return value;
}

module.exports = { validateFamilyInput, validateNamedEntity, validateDate, personFields };
