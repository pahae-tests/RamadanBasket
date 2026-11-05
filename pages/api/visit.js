// pages/api/site-visits.js
//
// Incrémente de 1 la première (et seule) ligne de site_visits.
// S'il n'y a aucune ligne, insère (id = 0, visits = 0).
//
// Table attendue (id SANS AUTO_INCREMENT, sinon MySQL remplace id = 0 par 1) :
//   CREATE TABLE IF NOT EXISTS site_visits (
//     id INT UNSIGNED NOT NULL,
//     visits BIGINT UNSIGNED NOT NULL DEFAULT 0,
//     PRIMARY KEY (id)
//   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

import { query } from "@/lib/db";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const update = await query("UPDATE site_visits SET visits = visits + 1 LIMIT 1");
    if (update.affectedRows === 0) {
      // INSERT IGNORE : si deux requêtes arrivent en même temps, la 2e ne plante pas
      await query("INSERT IGNORE INTO site_visits (id, visits) VALUES (0, 0)");
    }
    const [row] = await query("SELECT visits FROM site_visits LIMIT 1");
    return res.status(200).json({ ok: true, visits: Number(row.visits) });
  } catch (error) {
    console.error("site-visits error:", error);
    return res.status(500).json({ ok: false, error: error.code || "Erreur serveur" });
  }
}