require('dotenv').config();
const sql = require("mssql");
let poolPromise;

// Helper function to safely parse integers with fallback
const safeParseInt = (value, defaultValue) => {
  const parsed = parseInt(value);
  return isNaN(parsed) ? defaultValue : parsed;
};

const config = {
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  port: process.env.DB_PORT ? safeParseInt(process.env.DB_PORT, undefined) : undefined,
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true' || true,
    packetSize: safeParseInt(process.env.DB_PACKET_SIZE, 16368),
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true' || true,
    instanceName: process.env.DB_INSTANCE_NAME || undefined,
  },
  pool: {
    max: safeParseInt(process.env.DB_POOL_MAX, 10), // Increased from 1 to 10 for better concurrency
    min: safeParseInt(process.env.DB_POOL_MIN, 2),  // Keep 2 connections ready
    idleTimeoutMillis: safeParseInt(process.env.DB_IDLE_TIMEOUT, 30000),
  },
  requestTimeout: safeParseInt(process.env.DB_REQUEST_TIMEOUT, 15000), // 15 second timeout for queries
  connectionTimeout: safeParseInt(process.env.DB_CONNECTION_TIMEOUT, 15000), // 15 second timeout for connections
};

// Add authentication config - use Windows Authentication if user/password are empty
if (process.env.DB_USER && process.env.DB_PASSWORD) {
  config.user = process.env.DB_USER;
  config.password = process.env.DB_PASSWORD;
} else {
  // Windows Authentication - use default authentication
  config.authentication = {
    type: 'default'
  };
}

async function getPool() {
  if (!poolPromise) {
    poolPromise = sql.connect(config);
  }
  return poolPromise;
}

async function closePool() {
  if (poolPromise) {
    try {
      await sql.close();
      poolPromise = null;
    } catch (err) {
      console.error("Error closing the connection pool:", err);
    }
  }
}

process.on("SIGINT", async () => {
  await closePool();
  process.exit(0);
});

const getPagination = (current, pageSize, total = 0) => {
  return { current, pageSize, total };
};

module.exports = {
  getPagination,
  getPool,
};
