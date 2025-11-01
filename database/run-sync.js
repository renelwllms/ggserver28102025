/**
 * Database Sync Script Runner
 * Executes sync-to-live-database.sql on the live database
 */

const fs = require('fs');
const path = require('path');
const sql = require('mssql');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const config = {
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
    instanceName: process.env.DB_INSTANCE_NAME || undefined
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  },
  connectionTimeout: 30000,
  requestTimeout: 120000 // 2 minutes for long-running index creation
};

async function runScript() {
  console.log('=========================================');
  console.log('Database Sync Script Runner');
  console.log('=========================================\n');

  console.log(`Connecting to: ${config.server}`);
  console.log(`Database: ${config.database}\n`);

  let pool;

  try {
    // Connect to database
    pool = await sql.connect(config);
    console.log('✓ Connected to database\n');

    // Read SQL script
    const scriptPath = path.join(__dirname, 'sync-to-live-database.sql');
    const sqlScript = fs.readFileSync(scriptPath, 'utf8');
    console.log(`✓ Loaded script: ${scriptPath}\n`);

    // Split by GO statements (SQL Server batch separator)
    const batches = sqlScript
      .split(/^\s*GO\s*$/gim)
      .map(b => b.trim())
      .filter(b => b.length > 0);

    console.log(`Found ${batches.length} batches to execute\n`);
    console.log('=========================================');
    console.log('Executing SQL batches...');
    console.log('=========================================\n');

    // Execute each batch
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];

      try {
        const result = await pool.request().query(batch);

        // Print any messages (PRINT statements)
        if (result.recordset && result.recordset.length > 0) {
          console.log(result.recordset);
        }

        // Print info messages if available
        if (result.output) {
          console.log(result.output);
        }

      } catch (err) {
        // Some errors are just informational (like "already exists")
        if (err.message.includes('already exists')) {
          console.log(`ℹ Batch ${i + 1}: ${err.message}`);
        } else {
          console.error(`❌ Batch ${i + 1} error: ${err.message}`);
        }
      }
    }

    console.log('\n=========================================');
    console.log('✓ Script execution completed!');
    console.log('=========================================\n');

  } catch (err) {
    console.error('\n❌ Fatal Error:', err.message);
    console.error('\nFull error:', err);
    process.exit(1);
  } finally {
    if (pool) {
      await pool.close();
      console.log('✓ Database connection closed\n');
    }
  }
}

// Run the script
runScript().catch(console.error);
