const { query, withTransaction } = require("./db");
const { HttpError } = require("./errors");
const { hashPassword, validatePasswordStrength } = require("./auth");
const { audit } = require("./audit");

function formatUser(u) {
  return { id: u.id, username: u.username, role: u.role, isActive: Boolean(u.is_active), lastLoginAt: u.last_login_at, createdAt: u.created_at };
}

function parseUsername(value) {
  const username = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (username.length < 2 || username.length > 60 || !/^[\p{L}\p{N}][\p{L}\p{N} ._'-]*$/u.test(username)) {
    throw new HttpError(400, "Nom invalide : 2 à 60 caractères (lettres, chiffres, espace, point, tiret).");
  }
  return username;
}

async function listUsers({ q, offset, pageSize }) {
  const like = q ? `%${String(q).replace(/[\\%_]/g, (c) => "\\" + c)}%` : null;
  const where = like ? "WHERE username LIKE ?" : "";
  const params = like ? [like] : [];
  const total = await query(`SELECT COUNT(*) AS c FROM users ${where}`, params);
  const rows = await query(`SELECT id, username, role, is_active, last_login_at, created_at FROM users ${where} ORDER BY username LIMIT ? OFFSET ?`, [...params, pageSize, offset]);
  return { items: rows.map(formatUser), total: total[0].c };
}

async function createUser(input, adminId) {
  const username = parseUsername(input.username);
  const role = input.role === "admin" ? "admin" : "user";
  validatePasswordStrength(input.password);
  const hash = await hashPassword(input.password);
  const result = await query("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)", [username, hash, role]);
  await audit(null, adminId, "user.create", "user", result.insertId, { username, role });
  return result.insertId;
}

async function assertNotLastAdmin(tx, userId, willBeAdminActive) {
  if (willBeAdminActive) return;
  const target = await tx.query("SELECT role, is_active FROM users WHERE id = ? FOR UPDATE", [userId]);
  if (!target[0]) throw new HttpError(404, "Utilisateur introuvable.");
  if (target[0].role !== "admin" || !target[0].is_active) return;
  const admins = await tx.query("SELECT id FROM users WHERE role = 'admin' AND is_active = 1 FOR UPDATE");
  if (admins.length <= 1) throw new HttpError(409, "Impossible : il doit rester au moins un administrateur actif.");
}

async function updateUser(id, input, adminId) {
  const username = parseUsername(input.username);
  const role = input.role === "admin" ? "admin" : "user";
  const isActive = input.isActive === false ? 0 : 1;
  await withTransaction(async (tx) => {
    await assertNotLastAdmin(tx, id, role === "admin" && isActive === 1);
    const result = await tx.query("UPDATE users SET username = ?, role = ?, is_active = ? WHERE id = ?", [username, role, isActive, id]);
    if (!result.affectedRows) throw new HttpError(404, "Utilisateur introuvable.");
    if (!isActive) await tx.query("DELETE FROM sessions WHERE user_id = ?", [id]);
    await audit(tx, adminId, "user.update", "user", id, { username, role, isActive });
  });
}

async function resetPassword(id, password, adminId) {
  validatePasswordStrength(password);
  const hash = await hashPassword(password);
  await withTransaction(async (tx) => {
    const result = await tx.query("UPDATE users SET password_hash = ? WHERE id = ?", [hash, id]);
    if (!result.affectedRows) throw new HttpError(404, "Utilisateur introuvable.");
    await tx.query("DELETE FROM sessions WHERE user_id = ?", [id]);
    await audit(tx, adminId, "user.resetPassword", "user", id, null);
  });
}

async function deleteUser(id, adminId) {
  if (id === adminId) throw new HttpError(409, "Vous ne pouvez pas supprimer votre propre compte.");
  await withTransaction(async (tx) => {
    await assertNotLastAdmin(tx, id, false);
    const result = await tx.query("DELETE FROM users WHERE id = ?", [id]);
    if (!result.affectedRows) throw new HttpError(404, "Utilisateur introuvable.");
    await audit(tx, adminId, "user.delete", "user", id, null);
  });
}

module.exports = { parseUsername, listUsers, createUser, updateUser, resetPassword, deleteUser };
