const { runBackup } = require("../../../lib/backup");
const { safeEqual, checkRateLimit, registerRateHit } = require("../../../lib/auth");
const { clientIp } = require("../../../lib/http");

export const config = { api: { bodyParser: false, responseLimit: false }, maxDuration: 60 };

const WINDOW_SECONDS = 15 * 60;
const MAX_FAILURES = 20;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Méthode non autorisée." });
    return;
  }
  const secret = process.env.BACKUP_API_SECRET;
  if (!secret) {
    res.status(500).json({ error: "BACKUP_API_SECRET n'est pas configuré sur le serveur." });
    return;
  }
  try {
    const bucket = `backup:ip:${clientIp(req)}`;
    const state = await checkRateLimit(bucket, MAX_FAILURES, WINDOW_SECONDS);
    if (state.blocked) {
      res.status(429).json({ error: "Trop de tentatives." });
      return;
    }
    const header = req.headers.authorization || "";
    const match = header.match(/^Bearer (.+)$/);
    if (!match || !safeEqual(match[1], secret)) {
      await registerRateHit(bucket, WINDOW_SECONDS);
      res.status(401).json({ error: "Non autorisé." });
      return;
    }
    const outcome = await runBackup();
    res.status(outcome.httpStatus).json(outcome.body);
  } catch (error) {
    console.error("backup_error", error && error.code ? error.code : "unexpected");
    res.status(500).json({ status: "failed", error: "La sauvegarde a échoué de manière inattendue." });
  }
}

