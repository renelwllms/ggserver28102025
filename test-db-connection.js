require('dotenv').config();
const sql = require('mssql');

const config = {
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : undefined,
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true' || true,
    packetSize: parseInt(process.env.DB_PACKET_SIZE) || 16368,
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true' || true,
    instanceName: process.env.DB_INSTANCE_NAME || undefined,
  },
  pool: {
    max: parseInt(process.env.DB_POOL_MAX) || 1,
    min: parseInt(process.env.DB_POOL_MIN) || 0,
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000,
  },
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

console.log('Testing database connection with config:');
console.log({
  server: config.server,
  database: config.database,
  authenticationType: config.authentication ? 'Windows Authentication (NTLM)' : 'SQL Server Authentication',
  user: config.user || 'Current Windows User',
  instanceName: config.options.instanceName,
  encrypt: config.options.encrypt,
  trustServerCertificate: config.options.trustServerCertificate
});

async function testConnection() {
  try {
    console.log('\nAttempting to connect...');
    const pool = await sql.connect(config);
    console.log('✓ Successfully connected to database!');

    // Test a simple query
    const result = await pool.request().query('SELECT DB_NAME() as DatabaseName, @@VERSION as Version');
    console.log('\n✓ Query successful!');
    console.log('Database:', result.recordset[0].DatabaseName);
    console.log('Version:', result.recordset[0].Version.split('\n')[0]);

    await pool.close();
    console.log('\n✓ Connection closed successfully');
    process.exit(0);
  } catch (err) {
    console.error('\n✗ Connection failed:');
    console.error('Error:', err.message);
    console.error('\nFull error:', err);
    process.exit(1);
  }
}

testConnection();
