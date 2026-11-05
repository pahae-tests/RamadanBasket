const mysql = require("mysql2/promise");

function buildConfig() {
  const config = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_POOL_SIZE || 4),
    maxIdle: Number(process.env.DB_POOL_SIZE || 4),
    idleTimeout: 20000,
    queueLimit: 50,
    charset: "utf8mb4",
    timezone: "+00:00",
    dateStrings: true,
    decimalNumbers: true,
    supportBigNumbers: true,
    bigNumberStrings: false,
    enableKeepAlive: true,
    connectTimeout: 15000
  };
  // if (String(process.env.DB_SSL || "").toLowerCase() === "true") {
  //   const ssl = { rejectUnauthorized: String(process.env.DB_SSL_REJECT_UNAUTHORIZED || "true").toLowerCase() !== "false" };
  //   if (process.env.DB_SSL_CA) ssl.ca = process.env.DB_SSL_CA.replace(/\\n/g, "\n");
  //   config.ssl = ssl;
  // }
  return config;
}

function getPool() {
  if (!global.__rbmPool) {
    global.__rbmPool = mysql.createPool(buildConfig());
  }
  return global.__rbmPool;
}

async function query(sql, params = []) {
  const [rows] = await getPool().query(sql, params);
  return rows;
}

async function withTransaction(fn) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const tx = {
      async query(sql, params = []) {
        const [rows] = await connection.query(sql, params);
        return rows;
      },
      connection
    };
    const result = await fn(tx);
    await connection.commit();
    return result;
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      void rollbackError;
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function closePool() {
  if (global.__rbmPool) {
    await global.__rbmPool.end();
    global.__rbmPool = null;
  }
}

module.exports = { query, withTransaction, getPool, closePool };
