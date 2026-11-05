const crypto = require("crypto");
const { query } = require("./db");
const storage = require("./storage");
const sqlDump = require("./sqlDump");
const excel = require("./excel");
const { todayCasablanca } = require("./distributions");
const { isDuplicateError } = require("./errors");

const STALE_MINUTES = 15;

function sanitizeError(error) {
  const text = error && error.message ? String(error.message) : "Erreur inconnue";
  return text.replace(/(password|secret|key|token)=\S+/gi, "$1=***").slice(0, 400);
}

async function claimRun(date, executionId) {
  try {
    const result = await query("INSERT INTO backup_runs (operational_date, execution_id, status) VALUES (?, ?, 'running')", [date, executionId]);
    return { claimed: true, id: result.insertId };
  } catch (error) {
    if (!isDuplicateError(error)) throw error;
    const rows = await query(
      "SELECT id, status, execution_id, TIMESTAMPDIFF(MINUTE, started_at, UTC_TIMESTAMP()) AS age FROM backup_runs WHERE operational_date = ? AND status IN ('running','success') ORDER BY id DESC LIMIT 1",
      [date]
    );
    const existing = rows[0];
    if (!existing) return claimRun(date, executionId);
    if (existing.status === "running" && existing.age >= STALE_MINUTES) {
      await query("UPDATE backup_runs SET status = 'failed', error_message = ?, completed_at = UTC_TIMESTAMP() WHERE id = ? AND status = 'running'", [
        "Exécution abandonnée (délai dépassé).",
        existing.id
      ]);
      return claimRun(date, executionId);
    }
    return { claimed: false, existing };
  }
}

async function runSqlBackup(runId, prefix, executionId) {
  const key = `${prefix}${executionId}-database.sql.gz`;
  const dump = await sqlDump.openDumpStream();
  try {
    await storage.putStream(key, dump.stream, "application/gzip");
  } finally {
    await dump.release();
  }
  const size = await storage.headSize(key);
  if (!size) throw new Error("Objet SQL vide après envoi.");
  await query("UPDATE backup_runs SET sql_status = 'success', sql_key = ?, sql_size = ? WHERE id = ?", [key, size, runId]);
  return { key, size, tables: dump.stats.tables };
}

async function runExcelBackup(runId, prefix, executionId) {
  const key = `${prefix}${executionId}-snapshot.xlsx`;
  const workbook = await excel.buildSnapshotWorkbook();
  const buffer = await excel.workbookToBuffer(workbook);
  await storage.putBuffer(key, buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  const size = await storage.headSize(key);
  if (size !== buffer.length) throw new Error("Taille de l'objet Excel incohérente après envoi.");
  await query("UPDATE backup_runs SET excel_status = 'success', excel_key = ?, excel_size = ? WHERE id = ?", [key, size, runId]);
  return { key, size };
}

function formatRun(r) {
  return {
    id: r.id,
    operationalDate: r.operational_date,
    executionId: r.execution_id,
    status: r.status,
    sqlStatus: r.sql_status,
    excelStatus: r.excel_status,
    sqlSize: r.sql_size === null ? null : Number(r.sql_size),
    excelSize: r.excel_size === null ? null : Number(r.excel_size),
    error: r.error_message,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    hasSql: r.sql_status === "success" && Boolean(r.sql_key),
    hasExcel: r.excel_status === "success" && Boolean(r.excel_key)
  };
}

async function runBackup() {
  const date = todayCasablanca();
  const executionId = crypto.randomUUID();
  const claim = await claimRun(date, executionId);
  if (!claim.claimed) {
    const rows = await query("SELECT * FROM backup_runs WHERE id = ?", [claim.existing.id]);
    const run = formatRun(rows[0]);
    return {
      httpStatus: claim.existing.status === "success" ? 200 : 409,
      body: {
        status: claim.existing.status === "success" ? "already_completed" : "in_progress",
        message: claim.existing.status === "success" ? "Une sauvegarde réussie existe déjà pour cette date." : "Une sauvegarde est déjà en cours pour cette date.",
        operationalDate: date,
        run
      }
    };
  }
  const runId = claim.id;
  if (!storage.isConfigured()) {
    const message = `Stockage de sauvegarde non configuré. Variables manquantes : ${storage.missingConfig().join(", ")}.`;
    await query("UPDATE backup_runs SET status = 'failed', sql_status = 'failed', excel_status = 'failed', error_message = ?, completed_at = UTC_TIMESTAMP() WHERE id = ?", [message, runId]);
    return { httpStatus: 500, body: { status: "failed", message, operationalDate: date, executionId } };
  }
  const prefix = `ramadan-backups/${date}/`;
  const errors = [];
  let sqlOk = false;
  let excelOk = false;
  let sqlInfo = null;
  let excelInfo = null;
  try {
    sqlInfo = await runSqlBackup(runId, prefix, executionId);
    sqlOk = true;
  } catch (error) {
    errors.push(`SQL : ${sanitizeError(error)}`);
    await query("UPDATE backup_runs SET sql_status = 'failed' WHERE id = ?", [runId]);
  }
  try {
    excelInfo = await runExcelBackup(runId, prefix, executionId);
    excelOk = true;
  } catch (error) {
    errors.push(`Excel : ${sanitizeError(error)}`);
    await query("UPDATE backup_runs SET excel_status = 'failed' WHERE id = ?", [runId]);
  }
  const status = sqlOk && excelOk ? "success" : sqlOk || excelOk ? "partial" : "failed";
  await query("UPDATE backup_runs SET status = ?, error_message = ?, completed_at = UTC_TIMESTAMP() WHERE id = ?", [status, errors.length ? errors.join(" | ").slice(0, 500) : null, runId]);
  await query("DELETE FROM sessions WHERE expires_at < UTC_TIMESTAMP()");
  await query("DELETE FROM rate_limits WHERE window_start < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY)");
  const rows = await query("SELECT * FROM backup_runs WHERE id = ?", [runId]);
  return {
    httpStatus: status === "success" ? 200 : 500,
    body: {
      status,
      operationalDate: date,
      executionId,
      sql: sqlInfo ? { status: "success", size: sqlInfo.size } : { status: "failed" },
      excel: excelInfo ? { status: "success", size: excelInfo.size } : { status: "failed" },
      errors,
      run: formatRun(rows[0])
    }
  };
}

async function listRuns(limit = 100) {
  const rows = await query("SELECT * FROM backup_runs ORDER BY operational_date DESC, id DESC LIMIT ?", [limit]);
  return rows.map(formatRun);
}

async function downloadInfo(runId, type) {
  const rows = await query("SELECT * FROM backup_runs WHERE id = ?", [runId]);
  const run = rows[0];
  if (!run) return null;
  if (type === "excel" && run.excel_status === "success" && run.excel_key) {
    return { key: run.excel_key, filename: `sauvegarde-${String(run.operational_date).slice(0, 10)}.xlsx` };
  }
  if (type === "sql" && run.sql_status === "success" && run.sql_key) {
    return { key: run.sql_key, filename: `sauvegarde-${String(run.operational_date).slice(0, 10)}.sql.gz` };
  }
  return null;
}

module.exports = { runBackup, listRuns, downloadInfo, formatRun };
