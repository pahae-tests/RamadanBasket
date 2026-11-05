const { loadEnv } = require("../lib/loadEnv");
loadEnv();
const { query, closePool } = require("../lib/db");
const { hashPassword, validatePasswordStrength } = require("../lib/auth");

async function main() {
  const username = (process.env.ADMIN_USERNAME || "").replace(/\s+/g, " ").trim();
  const password = process.env.ADMIN_PASSWORD || "";
  if (!username) throw new Error("ADMIN_USERNAME est requis.");
  validatePasswordStrength(password);
  const admins = await query("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND is_active = 1");
  if (admins[0].c > 0 && process.env.ADMIN_FORCE !== "true") {
    throw new Error("Un administrateur actif existe déjà. Utilisez l'interface Utilisateurs, ou ADMIN_FORCE=true pour en créer un autre.");
  }
  const hash = await hashPassword(password);
  await query("INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'admin')", [username, hash]);
  console.log(`Administrateur « ${username} » créé.`);
}

main()
  .then(() => closePool())
  .catch(async (error) => {
    console.error("Échec :", error.message);
    await closePool();
    process.exit(1);
  });
