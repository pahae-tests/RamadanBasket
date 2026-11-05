const fs = require("fs");
const path = require("path");
const { getPool } = require("./db");

async function migrateSponsorKinds(pool) {
  const [cols] = await pool.query("SELECT column_name AS name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'sponsors'");
  const names = cols.map((c) => c.name || c.COLUMN_NAME);
  if (names.includes("type")) return;
  await pool.query("ALTER TABLE sponsors ADD COLUMN type ENUM('group', 'classic', 'special', 'sub') NOT NULL DEFAULT 'classic' AFTER phone_norm");
  if (names.includes("is_group")) {
    await pool.query("UPDATE sponsors SET type = 'group' WHERE is_group = 1");
    await pool.query("ALTER TABLE sponsors DROP COLUMN is_group");
  }
}

async function applySchema() {
  const sql = fs.readFileSync(path.join(process.cwd(), "sql", "schema.sql"), "utf8");
  const statements = sql
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const pool = getPool();
  for (const statement of statements) {
    await pool.query(statement);
  }
  await migrateSponsorKinds(pool);
  return statements.length;
}

module.exports = { applySchema };
