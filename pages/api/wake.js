import { query } from "@/lib/db";

export default async function handler(req, res) {
  try {
    const [row] = await query("SELECT visits FROM site_visits LIMIT 1");
    return res.status(200).json({ ok: true, visits: Number(row.visits) });
  } catch (error) {
    console.error("site-visits error:", error);
    return res.status(500).json({ ok: false, error: error.code || "Erreur serveur" });
  }
}
