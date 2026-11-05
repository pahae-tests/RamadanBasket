const ExcelJS = require("exceljs");
const { query, withTransaction } = require("./db");
const { HttpError } = require("./errors");
const { audit } = require("./audit");
const { normalizeName, nameKey, normalizeCin, isValidCin, normalizePhone, isValidPhone, cleanText, scoreName } = require("./normalize");
const { invalidateSearch } = require("./search");
const { canHaveFamilies, TYPE_LABELS } = require("./sponsorRules");

const MAX_ROWS = 5000;
const MAX_COLUMNS = 30;

const FIELDS = [
  { key: "reference", label: "Référence famille", required: false, synonyms: ["reference", "referencefamille", "famille", "numerofamille", "idfamille", "ref"] },
  { key: "role", label: "Rôle", required: false, synonyms: ["role", "statut", "type"] },
  { key: "fullName", label: "Nom complet", required: true, synonyms: ["nomcomplet", "nom", "nomprenom", "name", "fullname", "beneficiaire"] },
  { key: "cin", label: "CIN", required: true, synonyms: ["cin", "cnie", "carteidentite", "cartenationale"] },
  { key: "phone", label: "Téléphone", required: false, synonyms: ["telephone", "tel", "gsm", "phone", "mobile", "numerotelephone"] },
  { key: "sponsor", label: "Parrain", required: true, synonyms: ["parrain", "sponsor", "bienfaiteur"] },
  { key: "registeredAt", label: "Date d'inscription", required: false, synonyms: ["datedinscription", "dateinscription", "inscritle", "dateenregistrement"] }
];

function templateWorkbook() {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Import familles");
  ws.columns = FIELDS.map((f) => ({ header: f.label, key: f.key, width: f.key === "fullName" ? 30 : 20 }));
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF065F46" } };
  ws.getColumn(4).numFmt = "@";
  ws.getColumn(5).numFmt = "@";
  ws.addRow({ reference: "F1", role: "Responsable", fullName: "Mohamed Alaoui", cin: "AB123456", phone: "0612345678", sponsor: "Ahmed Bouknitir" });
  ws.addRow({ reference: "F1", role: "Membre", fullName: "Fatima Alaoui", cin: "", phone: "", sponsor: "" });
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const help = workbook.addWorksheet("Instructions");
  help.columns = [{ header: "Colonne", key: "c", width: 26 }, { header: "Description", key: "d", width: 100 }];
  help.getRow(1).font = { bold: true };
  const rows = [
    ["Référence famille", "Identifiant libre qui regroupe les lignes d'une même famille. Facultatif : sans référence, chaque ligne est une famille distincte."],
    ["Rôle", "Responsable ou Membre. Chaque famille doit avoir exactement un Responsable. Facultatif si aucune référence n'est utilisée."],
    ["Nom complet", "Obligatoire."],
    ["CIN", "Obligatoire pour le Responsable, facultatif pour les membres. Format carte nationale marocaine, par exemple AB123456. Chaque CIN doit être unique."],
    ["Téléphone", "Facultatif. 10 chiffres commençant par 05, 06 ou 07 (ou +212 suivi de 9 chiffres). Un membre sans téléphone reprend celui du Responsable."],
    ["Parrain", "Obligatoire sur la ligne du Responsable. Créé s'il n'existe pas."],
    ["Date d'inscription", "Facultatif. Formats acceptés : JJ/MM/AAAA ou AAAA-MM-JJ."]
  ];
  rows.forEach(([c, d]) => help.addRow({ c, d }));
  return workbook;
}

function cellText(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if (Array.isArray(value.richText)) return value.richText.map((p) => p.text).join("");
    if (value.result !== undefined && value.result !== null) return cellText(value.result);
    if (value.formula !== undefined) return "";
    if (value.text !== undefined) return cellText(value.text);
    if (value.error) return "";
    return "";
  }
  return String(value).trim();
}

async function parseWorkbook(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw new HttpError(400, "Le fichier n'est pas un classeur .xlsx valide.");
  }
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch (error) {
    throw new HttpError(400, "Le classeur est illisible ou corrompu.");
  }
  const ws = workbook.worksheets[0];
  if (!ws) throw new HttpError(400, "Le classeur ne contient aucune feuille.");
  const columnCount = Math.min(ws.columnCount, MAX_COLUMNS);
  if (ws.columnCount > MAX_COLUMNS) throw new HttpError(400, `Trop de colonnes (${MAX_COLUMNS} maximum).`);
  const headerRow = ws.getRow(1);
  const headers = [];
  for (let c = 1; c <= columnCount; c++) headers.push(cellText(headerRow.getCell(c).value) || `Colonne ${c}`);
  if (headers.length === 0) throw new HttpError(400, "La première ligne doit contenir les en-têtes de colonnes.");
  const rows = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const values = [];
    let any = false;
    for (let c = 1; c <= columnCount; c++) {
      const text = cellText(row.getCell(c).value);
      if (text) any = true;
      values.push(text);
    }
    if (!any) continue;
    if (rows.length >= MAX_ROWS) throw new HttpError(400, `Trop de lignes (${MAX_ROWS} maximum par import).`);
    rows.push({ n: r, v: values });
  }
  if (!rows.length) throw new HttpError(400, "Le classeur ne contient aucune ligne de données.");
  return { headers, rows, mapping: suggestMapping(headers), sheetName: ws.name };
}

function suggestMapping(headers) {
  const mapping = {};
  const used = new Set();
  const norm = headers.map((h) => normalizeName(h).replace(/\s+/g, ""));
  for (const field of FIELDS) {
    const index = norm.findIndex((h, i) => !used.has(i) && field.synonyms.includes(h));
    if (index >= 0) {
      mapping[field.key] = index;
      used.add(index);
    } else {
      mapping[field.key] = null;
    }
  }
  return mapping;
}

function parseDate(text) {
  if (!text) return { value: null };
  let m = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  let y;
  let mo;
  let d;
  if (m) {
    [, y, mo, d] = m;
  } else {
    m = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (!m) return { error: true };
    [, d, mo, y] = m;
  }
  const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const dt = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== iso) return { error: true };
  if (Number(y) < 2000 || dt > new Date(Date.now() + 86400000)) return { error: true };
  return { value: iso };
}

function parseRole(text) {
  const n = normalizeName(text);
  if (!n) return null;
  if (["responsable", "representant", "chef", "chef de famille", "rep", "r"].includes(n)) return "rep";
  if (["membre", "member", "m"].includes(n)) return "member";
  return "invalid";
}

function suggestRole(text) {
  const n = normalizeName(text);
  if (!n) return null;
  if (n.startsWith("resp") || n.startsWith("rep") || n.startsWith("chef")) return "Responsable";
  if (n.startsWith("mem") || n.startsWith("mbr")) return "Membre";
  return null;
}

function getCell(row, index) {
  if (index === null || index === undefined) return "";
  return (row.v[index] || "").trim();
}

async function validateImport({ rows, mapping, mode }) {
  const errors = [];
  const warnings = [];
  const addError = (row, field, value, message, suggestion) =>
    errors.push({ row, column: field, value: value === undefined ? "" : value, message, suggestion: suggestion || null, severity: "error" });
  const addWarning = (row, field, value, message, suggestion) =>
    warnings.push({ row, column: field, value: value === undefined ? "" : value, message, suggestion: suggestion || null, severity: "warning" });

  if (!Array.isArray(rows) || !rows.length) throw new HttpError(400, "Aucune ligne à valider.");
  if (rows.length > MAX_ROWS) throw new HttpError(400, `Trop de lignes (${MAX_ROWS} maximum).`);
  if (!mapping || mapping.fullName === null || mapping.fullName === undefined) {
    throw new HttpError(400, "La colonne « Nom complet » doit être associée.");
  }
  const replace = mode === "replace";
  const hasRef = mapping.reference !== null && mapping.reference !== undefined;
  const hasRole = mapping.role !== null && mapping.role !== undefined;

  const parsed = rows.map((row, i) => ({
    n: Number(row.n) || i + 2,
    ref: getCell(row, mapping.reference),
    roleText: getCell(row, mapping.role),
    name: cleanText(getCell(row, mapping.fullName), 160),
    cinRaw: getCell(row, mapping.cin),
    phoneRaw: getCell(row, mapping.phone),
    sponsor: cleanText(getCell(row, mapping.sponsor), 160),
    dateRaw: getCell(row, mapping.registeredAt)
  }));

  const cinRows = new Map();
  for (const p of parsed) {
    if (!p.name || p.name.length < 2) addError(p.n, "Nom complet", p.name || "", "Le nom complet est obligatoire.");
    p.cin = normalizeCin(p.cinRaw);
    if (p.cin && !isValidCin(p.cin)) {
      addError(p.n, "CIN", p.cinRaw, "Format de CIN invalide (ex. AB123456).");
      p.cin = null;
      p.cinInvalid = true;
    }
    p.phone = normalizePhone(p.phoneRaw);
    if (p.phone && !isValidPhone(p.phone)) {
      addError(p.n, "Téléphone", p.phoneRaw, "Numéro invalide : 10 chiffres commençant par 05, 06 ou 07.");
      p.phone = null;
    }
    const date = parseDate(p.dateRaw);
    if (date.error) addError(p.n, "Date d'inscription", p.dateRaw, "Date invalide (JJ/MM/AAAA ou AAAA-MM-JJ, passée).");
    p.registeredAt = date.value || null;
    if (hasRole) {
      const role = parseRole(p.roleText);
      if (role === null) addError(p.n, "Rôle", p.roleText, "Le rôle est obligatoire (Responsable ou Membre).");
      else if (role === "invalid") addError(p.n, "Rôle", p.roleText, "Rôle inconnu : utilisez Responsable ou Membre.", suggestRole(p.roleText));
      p.role = role === "invalid" ? null : role;
    } else {
      p.role = "rep";
    }
    if (p.role === "rep") {
      if (!p.cin && !p.cinInvalid) addError(p.n, "CIN", "", "Le CIN du responsable est obligatoire.");
      if (!p.sponsor) addError(p.n, "Parrain", "", "Le parrain du responsable est obligatoire.");
    }
    if (hasRef && !p.ref) addError(p.n, "Référence famille", "", "La référence famille est obligatoire lorsque la colonne est utilisée.");
    if (p.cin) {
      if (!cinRows.has(p.cin)) cinRows.set(p.cin, []);
      cinRows.get(p.cin).push(p.n);
    }
  }

  for (const [cin, list] of cinRows) {
    if (list.length > 1) {
      for (const n of list) {
        addError(n, "CIN", cin, `CIN en double dans le fichier (lignes ${list.join(", ")}).`);
      }
    }
  }

  if (!replace && cinRows.size) {
    const cins = [...cinRows.keys()];
    for (let i = 0; i < cins.length; i += 500) {
      const chunk = cins.slice(i, i + 500);
      const existing = await query(
        `SELECT m.cin_norm, m.family_id, m.full_name, (SELECT r.full_name FROM family_members r WHERE r.family_id = m.family_id AND r.is_representative = 1 LIMIT 1) AS rep
         FROM family_members m WHERE m.cin_norm IN (?)`,
        [chunk]
      );
      for (const e of existing) {
        for (const n of cinRows.get(e.cin_norm)) {
          addError(n, "CIN", e.cin_norm, `CIN déjà enregistré : ${e.full_name} (famille n° ${e.family_id}, responsable ${e.rep || "inconnu"}).`);
        }
      }
    }
  }

  const groups = new Map();
  let autoRef = 0;
  for (const p of parsed) {
    const key = hasRef ? p.ref : `__row${++autoRef}`;
    p.groupKey = key;
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  for (const [key, list] of groups) {
    if (!hasRef) continue;
    const reps = list.filter((p) => p.role === "rep");
    const noRoleKnown = list.some((p) => p.role === null);
    if (reps.length === 0 && !noRoleKnown) {
      for (const p of list) addError(p.n, "Rôle", p.roleText, `La famille « ${key} » n'a aucun Responsable.`);
    } else if (reps.length > 1) {
      for (const p of reps) addError(p.n, "Rôle", p.roleText, `La famille « ${key} » a plusieurs Responsables (lignes ${reps.map((r) => r.n).join(", ")}).`);
    }
  }

  const sponsorInfo = await loadSponsorNames(replace);
  const sponsorsInFile = new Map();
  for (const [, list] of groups) {
    const rep = list.find((p) => p.role === "rep");
    if (!rep || !rep.sponsor) continue;
    const norm = normalizeName(rep.sponsor);
    if (!norm) continue;
    const exact = sponsorInfo.find((s) => s.norm === norm);
    if (exact) {
      if (!exact.canHaveFamilies) {
        const hint = exact.type === "group" ? "un de ses parrains" : "un de ses sous-parrains";
        addError(rep.n, "Parrain", rep.sponsor, `« ${exact.name} » est un ${TYPE_LABELS[exact.type].toLowerCase()} : il n'a pas de familles, indiquez ${hint}.`);
      }
      rep.sponsorResolved = { existingId: exact.id, name: exact.name };
      continue;
    }
    const similarExisting = sponsorInfo.filter((s) => scoreName(rep.sponsor, s.name).kind === "approx").slice(0, 1);
    if (similarExisting.length) {
      addWarning(rep.n, "Parrain", rep.sponsor, `Parrain proche d'un parrain existant : « ${similarExisting[0].name} ». Un nouveau parrain sera créé sauf correction.`, similarExisting[0].name);
    }
    const seenSimilar = [...sponsorsInFile.values()].find((s) => s.norm !== norm && scoreName(rep.sponsor, s.name).kind === "approx");
    if (seenSimilar) {
      addWarning(rep.n, "Parrain", rep.sponsor, `Parrain proche d'un autre parrain du fichier : « ${seenSimilar.name} ».`, seenSimilar.name);
    }
    if (!sponsorsInFile.has(norm)) sponsorsInFile.set(norm, { norm, name: rep.sponsor });
    rep.sponsorResolved = { existingId: null, name: rep.sponsor };
  }

  if (!replace) {
    const phones = [...new Set(parsed.filter((p) => p.role === "rep" && p.phone).map((p) => p.phone))];
    for (let i = 0; i < phones.length; i += 500) {
      const chunk = phones.slice(i, i + 500);
      const existing = await query(
        `SELECT f.id, f.phone_norm, r.full_name FROM families f JOIN family_members r ON r.family_id = f.id AND r.is_representative = 1 WHERE f.phone_norm IN (?)`,
        [chunk]
      );
      for (const e of existing) {
        for (const p of parsed.filter((x) => x.role === "rep" && x.phone === e.phone_norm)) {
          const s = scoreName(p.name || "", e.full_name);
          if (s.kind === "exact" || s.kind === "approx") {
            addWarning(p.n, "Nom complet", p.name, `Doublon probable de la famille n° ${e.id} (« ${e.full_name} », même téléphone).`);
          }
        }
      }
    }
  }

  const families = [];
  for (const [key, list] of groups) {
    const rep = list.find((p) => p.role === "rep");
    if (!rep) continue;
    families.push({
      key,
      sponsor: rep.sponsorResolved || null,
      registeredAt: rep.registeredAt,
      phone: rep.phone,
      representative: { fullName: rep.name, cin: rep.cin, phone: rep.phone, row: rep.n },
      members: list.filter((p) => p !== rep && p.role === "member").map((p) => ({ fullName: p.name, cin: p.cin, phone: p.phone || rep.phone || null, row: p.n }))
    });
  }

  errors.sort((a, b) => a.row - b.row);
  warnings.sort((a, b) => a.row - b.row);
  const invalidRows = new Set(errors.map((e) => e.row));
  return {
    errors,
    warnings,
    families,
    summary: {
      totalRows: parsed.length,
      invalidRows: invalidRows.size,
      validRows: parsed.length - invalidRows.size,
      families: families.length,
      members: families.reduce((s, f) => s + f.members.length + 1, 0),
      newSponsors: [...sponsorsInFile.values()].length,
      mode: replace ? "replace" : "add"
    }
  };
}

async function loadSponsorNames(replace) {
  if (replace) return [];
  const rows = await query("SELECT id, full_name, name_norm, type FROM sponsors");
  return rows.map((r) => ({ id: r.id, name: r.full_name, norm: r.name_norm, type: r.type, canHaveFamilies: canHaveFamilies(r.type) }));
}

async function saveSession(adminId, filename, mode, result, status) {
  const res = await query("INSERT INTO import_sessions (admin_id, filename, mode, status, total_rows, error_count, summary) VALUES (?, ?, ?, ?, ?, ?, ?)", [
    adminId,
    String(filename || "import.xlsx").slice(0, 255),
    mode === "replace" ? "replace" : "add",
    status,
    result.summary.totalRows,
    result.errors.length,
    JSON.stringify(result.summary)
  ]);
  const sessionId = res.insertId;
  const toStore = result.errors.slice(0, 1000);
  if (toStore.length) {
    await query("INSERT INTO import_errors (session_id, row_num, column_name, original_value, message) VALUES ?", [
      toStore.map((e) => [sessionId, e.row, String(e.column).slice(0, 60), String(e.value || "").slice(0, 255), String(e.message).slice(0, 255)])
    ]);
  }
  return sessionId;
}

async function assertFamilySponsor(tx, id) {
  const rows = await tx.query("SELECT full_name, type FROM sponsors WHERE id = ? LOCK IN SHARE MODE", [id]);
  if (!rows[0] || !canHaveFamilies(rows[0].type)) {
    throw new HttpError(400, `Le parrain « ${rows[0] ? rows[0].full_name : id} » ne peut pas avoir de familles.`);
  }
}

async function runImport(tx, families, mode, userId) {
  const sponsorIds = new Map();
  if (mode === "replace") {
    await tx.query("DELETE FROM family_members");
    await tx.query("DELETE FROM families");
    await tx.query("UPDATE sponsors SET parent_id = NULL");
    await tx.query("DELETE FROM sponsors");
  }
  for (const f of families) {
    if (!f.sponsor) continue;
    const norm = normalizeName(f.sponsor.name);
    if (sponsorIds.has(norm)) continue;
    if (f.sponsor.existingId) {
      await assertFamilySponsor(tx, f.sponsor.existingId);
      sponsorIds.set(norm, f.sponsor.existingId);
      continue;
    }
    const existing = await tx.query("SELECT id FROM sponsors WHERE name_norm = ?", [norm]);
    if (existing[0]) {
      await assertFamilySponsor(tx, existing[0].id);
      sponsorIds.set(norm, existing[0].id);
      continue;
    }
    const res = await tx.query("INSERT INTO sponsors (full_name, name_norm, name_key) VALUES (?, ?, ?)", [f.sponsor.name, norm, nameKey(f.sponsor.name)]);
    sponsorIds.set(norm, res.insertId);
  }
  const familyIds = [];
  for (let i = 0; i < families.length; i += 50) {
    const chunk = families.slice(i, i + 50);
    const results = await Promise.all(
      chunk.map((f) =>
        tx.query("INSERT INTO families (sponsor_id, phone, phone_norm, created_by, created_at) VALUES (?, ?, ?, ?, COALESCE(?, UTC_TIMESTAMP()))", [
          f.sponsor ? sponsorIds.get(normalizeName(f.sponsor.name)) : null,
          f.phone,
          f.phone,
          userId,
          f.registeredAt
        ])
      )
    );
    results.forEach((r) => familyIds.push(r.insertId));
  }
  const memberValues = [];
  families.forEach((f, i) => {
    const familyId = familyIds[i];
    const push = (p, isRep) => memberValues.push([familyId, p.fullName, normalizeName(p.fullName), nameKey(p.fullName), p.cin, p.cin, p.phone, p.phone, isRep ? 1 : 0]);
    push(f.representative, true);
    f.members.forEach((m) => push(m, false));
  });
  for (let i = 0; i < memberValues.length; i += 500) {
    await tx.query(
      "INSERT INTO family_members (family_id, full_name, name_norm, name_key, cin, cin_norm, phone, phone_norm, is_representative) VALUES ?",
      [memberValues.slice(i, i + 500)]
    );
  }
  return { families: families.length, members: memberValues.length, sponsors: sponsorIds.size };
}

async function commitImport({ rows, mapping, mode, filename }, adminId) {
  const effectiveMode = mode === "replace" ? "replace" : "add";
  const validation = await validateImport({ rows, mapping, mode: effectiveMode });
  if (validation.errors.length) {
    const sessionId = await saveSession(adminId, filename, effectiveMode, validation, "rejected");
    throw new HttpError(422, "Des erreurs bloquantes subsistent. Aucune donnée n'a été importée.", { sessionId, errorCount: validation.errors.length });
  }
  let outcome;
  try {
    outcome = await withTransaction(async (tx) => {
      const lock = await tx.query("SELECT GET_LOCK('rbm_import', 0) AS got");
      if (!lock[0].got) throw new HttpError(409, "Un import est déjà en cours.");
      try {
        const result = await runImport(tx, validation.families, effectiveMode, adminId);
        await audit(tx, adminId, "import.commit", "import", null, { mode: effectiveMode, ...result, filename: String(filename || "").slice(0, 100) });
        return result;
      } finally {
        await tx.query("SELECT RELEASE_LOCK('rbm_import')");
      }
    });
  } catch (error) {
    if (error && (error.code === "ER_DUP_ENTRY" || error.errno === 1062)) {
      throw new HttpError(409, "Un CIN ou un parrain a été créé en parallèle : import annulé, aucune donnée modifiée. Relancez la validation.");
    }
    throw error;
  }
  invalidateSearch();
  const sessionId = await saveSession(adminId, filename, effectiveMode, validation, "imported");
  await query("UPDATE import_sessions SET completed_at = UTC_TIMESTAMP() WHERE id = ?", [sessionId]);
  return { sessionId, ...outcome };
}

function errorReportWorkbook(errors, warnings) {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Erreurs");
  ws.columns = [
    { header: "Ligne Excel", key: "row", width: 12 },
    { header: "Colonne", key: "column", width: 22 },
    { header: "Valeur d'origine", key: "value", width: 28 },
    { header: "Gravité", key: "severity", width: 12 },
    { header: "Description", key: "message", width: 70 },
    { header: "Suggestion", key: "suggestion", width: 28 }
  ];
  ws.getRow(1).font = { bold: true };
  ws.getColumn(3).numFmt = "@";
  for (const e of [...(errors || []), ...(warnings || [])]) {
    ws.addRow({
      row: e.row,
      column: String(e.column || ""),
      value: String(e.value || ""),
      severity: e.severity === "warning" ? "Avertissement" : "Erreur",
      message: String(e.message || ""),
      suggestion: e.suggestion ? String(e.suggestion) : ""
    });
  }
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 6 } };
  return workbook;
}

module.exports = { FIELDS, templateWorkbook, parseWorkbook, suggestMapping, validateImport, commitImport, errorReportWorkbook, MAX_ROWS };
