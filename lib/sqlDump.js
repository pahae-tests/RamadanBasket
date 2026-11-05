const zlib = require("zlib");
const { Readable } = require("stream");
const mysql = require("mysql2/promise");
const { getPool } = require("./db");

const SCHEMA_ORDER = ["users", "sessions", "rate_limits", "sponsors", "vendors", "families", "family_members", "distributions", "distribution_assignments", "audit_logs", "import_sessions", "import_errors", "backup_runs"];
const DATA_ORDER = ["users", "sponsors", "vendors", "families", "family_members", "distributions", "distribution_assignments", "audit_logs", "import_sessions", "import_errors"];
const CHUNK = 500;

async function insertableColumns(conn, table) {
  const [rows] = await conn.query(
    "SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND (GENERATION_EXPRESSION IS NULL OR GENERATION_EXPRESSION = '') ORDER BY ORDINAL_POSITION",
    [table]
  );
  return rows.map((r) => r.name);
}

async function* dumpLines(conn, stats) {
  yield "SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\nSET UNIQUE_CHECKS=0;\nSET SQL_MODE='NO_AUTO_VALUE_ON_ZERO';\n\n";
  for (const table of [...SCHEMA_ORDER].reverse()) {
    yield `DROP TABLE IF EXISTS \`${table}\`;\n`;
  }
  yield "\n";
  for (const table of SCHEMA_ORDER) {
    const [rows] = await conn.query(`SHOW CREATE TABLE \`${table}\``);
    yield `${rows[0]["Create Table"]};\n\n`;
  }
  for (const table of DATA_ORDER) {
    const columns = await insertableColumns(conn, table);
    const columnList = columns.map((c) => `\`${c}\``).join(", ");
    let lastId = 0;
    let count = 0;
    for (;;) {
      const [rows] = await conn.query(`SELECT ${columnList} FROM \`${table}\` WHERE id > ? ORDER BY id ASC LIMIT ${CHUNK}`, [lastId]);
      if (!rows.length) break;
      const tuples = rows.map((row) => `(${columns.map((c) => conn.escape(row[c])).join(", ")})`);
      yield `INSERT INTO \`${table}\` (${columnList}) VALUES\n${tuples.join(",\n")};\n`;
      lastId = rows[rows.length - 1].id;
      count += rows.length;
    }
    stats.tables[table] = count;
    yield "\n";
  }
  yield "SET FOREIGN_KEY_CHECKS=1;\nSET UNIQUE_CHECKS=1;\n";
}

async function openDumpStream() {
  const conn = await getPool().getConnection();
  const stats = { tables: {} };
  try {
    await conn.query("SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await conn.query("START TRANSACTION WITH CONSISTENT SNAPSHOT");
  } catch (error) {
    conn.release();
    throw error;
  }
  const source = Readable.from(dumpLines(conn, stats), { objectMode: false, encoding: "utf8" });
  const gzip = zlib.createGzip({ level: 6 });
  let released = false;
  const release = async () => {
    if (released) return;
    released = true;
    try {
      await conn.query("ROLLBACK");
    } catch (error) {
      void error;
    }
    conn.release();
  };
  source.on("error", (error) => gzip.destroy(error));
  gzip.on("close", release);
  gzip.on("error", release);
  source.pipe(gzip);
  return { stream: gzip, stats, release };
}

module.exports = { openDumpStream, SCHEMA_ORDER, DATA_ORDER, mysqlLib: mysql };
