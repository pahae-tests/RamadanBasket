const { query } = require("./db");

async function audit(runner, userId, action, entity, entityId, details) {
  const exec = runner && runner.query ? runner.query.bind(runner) : query;
  await exec("INSERT INTO audit_logs (user_id, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?)", [
    userId || null,
    action,
    entity || null,
    entityId === undefined || entityId === null ? null : String(entityId),
    details ? JSON.stringify(details).slice(0, 4000) : null
  ]);
}

module.exports = { audit };
