// pages/api/backdoor/uFgW9loKIuJde35Z/adminCreate.js
//
// Crée un compte admin.
// GET /api/backdoor/uFgW9loKIuJde35Z/adminCreate?username=...&password=...
// (POST avec { username, password } dans le body fonctionne aussi)
//
// Pense à encoder le mot de passe dans l'URL (encodeURIComponent), sinon "+", "&", "#"… sont mal interprétés.

import bcrypt from "bcryptjs";
import { query, withTransaction } from "@/lib/db";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const src = req.method === "POST" ? { ...req.query, ...(req.body || {}) } : req.query;
  const username = String(src.username || "").trim();
  const password = String(src.password || "");

  if (username.length < 3 || username.length > 60 || /\s/.test(username)) {
    return res.status(400).json({ ok: false, error: "username invalide (3 à 60 caractères, sans espaces)" });
  }
  if (password.length < 8) {
    return res.status(400).json({ ok: false, error: "password trop court (8 caractères minimum)" });
  }

  try {
    const existing = await query("SELECT id FROM users WHERE username = ? LIMIT 1", [username]);
    if (existing.length) {
      return res.status(409).json({ ok: false, error: "Un utilisateur avec ce username existe déjà" });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const id = await withTransaction(async (tx) => {
      const result = await tx.connection.query(
        "INSERT INTO users (username, password_hash, role, is_active) VALUES (?, ?, 'admin', 1)",
        [username, passwordHash]
      );
      const insertId = result[0].insertId;
      await tx.query("INSERT INTO audit_logs (user_id, action, entity, entity_id, details) VALUES (NULL, ?, ?, ?, ?)", [
        "admin_create",
        "user",
        String(insertId),
        JSON.stringify({ username }),
      ]);
      return insertId;
    });

    return res.status(201).json({ ok: true, id, username, role: "admin" });
  } catch (error) {
    if (error && error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ ok: false, error: "Un utilisateur avec ce username existe déjà" });
    }
    console.error("adminCreate error:", error);
    return res.status(500).json({ ok: false, error: error.code || "Erreur serveur", message: error.sqlMessage || error.message });
  }
}