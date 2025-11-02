/**
 * Sync main01 Database Script Runner
 * Executes sync-main01.sql to add missing columns
 */

const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const config = {
  server: 'localhost',
  database: 'main01',
  user: 'epladmin',
  password: 'b4b5AzU9pPs$$L27',
  options: {
    encrypt: false,
    trustServerCertificate: true,
    instanceName: 'SQLEXPRESS'
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  },
  connectionTimeout: 30000,
  requestTimeout: 120000
};

async function runScript() {
  console.log('=========================================');
  console.log('Sync main01 Database');
  console.log('=========================================\n');

  console.log(`Connecting to: ${config.server}\\${config.options.instanceName}`);
  console.log(`Database: ${config.database}\n`);

  let pool;

  try {
    // Connect to database
    pool = await sql.connect(config);
    console.log('✓ Connected to database\n');

    // Read SQL script
    const scriptPath = path.join(__dirname, 'sync-main01.sql');
    const sqlScript = fs.readFileSync(scriptPath, 'utf8');
    console.log(`✓ Loaded script: ${scriptPath}\n`);

    // Split by GO statements
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

        // Print any recordsets (SELECT results)
        if (result.recordset && result.recordset.length > 0) {
          console.log(result.recordset);
        }

      } catch (err) {
        // Some errors are informational
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
