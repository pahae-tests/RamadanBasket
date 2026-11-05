const crypto = require("crypto");

process.env.DB_HOST = process.env.TEST_DB_HOST || process.env.DB_HOST || "127.0.0.1";
process.env.DB_PORT = process.env.TEST_DB_PORT || process.env.DB_PORT || "3306";
process.env.DB_USER = process.env.TEST_DB_USER || process.env.DB_USER || "";
process.env.DB_PASSWORD = process.env.TEST_DB_PASSWORD || process.env.DB_PASSWORD || "";
process.env.DB_NAME = process.env.TEST_DB_NAME || process.env.DB_NAME || "";
process.env.DB_SSL = "false";
process.env.SESSION_TTL_HOURS = "12";
process.env.BACKUP_API_SECRET = crypto.randomBytes(24).toString("hex");

if (!/_test$/.test(process.env.DB_NAME)) {
  throw new Error("Les tests refusent de s'exécuter hors d'une base dont le nom se termine par _test.");
}
