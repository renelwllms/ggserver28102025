/**
 * Check if databases exist and compare their structures
 */

const sql = require('mssql');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const config = {
  server: 'localhost',
  user: 'epladmin',
  password: 'b4b5AzU9pPs$$L27',
  options: {
    encrypt: false,
    trustServerCertificate: true,
    instanceName: 'SQLEXPRESS'
  }
};

async function checkDatabase(dbName) {
  const dbConfig = { ...config, database: dbName };

  try {
    const pool = await sql.connect(dbConfig);

    // Get table count
    const tableResult = await pool.request().query(`
      SELECT COUNT(*) as TableCount
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
    `);

    // Get list of tables
    const tablesResult = await pool.request().query(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `);

    await pool.close();

    return {
      exists: true,
      tableCount: tableResult.recordset[0].TableCount,
      tables: tablesResult.recordset.map(r => r.TABLE_NAME)
    };
  } catch (err) {
    if (err.message.includes('Cannot open database')) {
      return { exists: false, error: 'Database does not exist' };
    }
    return { exists: false, error: err.message };
  }
}

async function main() {
  console.log('=========================================');
  console.log('Database Structure Comparison');
  console.log('=========================================\n');

  console.log('Checking databases on localhost\\SQLEXPRESS...\n');

  const db1 = await checkDatabase('main01');
  const db2 = await checkDatabase('ggdbmain01');

  console.log('Database: main01');
  if (db1.exists) {
    console.log(`  ✓ Exists`);
    console.log(`  Tables: ${db1.tableCount}`);
  } else {
    console.log(`  ✗ ${db1.error}`);
  }
  console.log('');

  console.log('Database: ggdbmain01');
  if (db2.exists) {
    console.log(`  ✓ Exists`);
    console.log(`  Tables: ${db2.tableCount}`);
  } else {
    console.log(`  ✗ ${db2.error}`);
  }
  console.log('');

  if (db1.exists && db2.exists) {
    console.log('=========================================');
    console.log('Comparison:');
    console.log('=========================================\n');

    if (db1.tableCount === db2.tableCount) {
      console.log(`✓ Both databases have ${db1.tableCount} tables`);
    } else {
      console.log(`⚠ Different table counts:`);
      console.log(`  main01: ${db1.tableCount} tables`);
      console.log(`  ggdbmain01: ${db2.tableCount} tables`);
    }
    console.log('');

    // Find differences
    const onlyInDb1 = db1.tables.filter(t => !db2.tables.includes(t));
    const onlyInDb2 = db2.tables.filter(t => !db1.tables.includes(t));

    if (onlyInDb1.length > 0) {
      console.log(`Tables only in main01 (${onlyInDb1.length}):`);
      onlyInDb1.forEach(t => console.log(`  - ${t}`));
      console.log('');
    }

    if (onlyInDb2.length > 0) {
      console.log(`Tables only in ggdbmain01 (${onlyInDb2.length}):`);
      onlyInDb2.forEach(t => console.log(`  - ${t}`));
      console.log('');
    }

    if (onlyInDb1.length === 0 && onlyInDb2.length === 0) {
      console.log('✓ Both databases have identical table names');
      console.log('\nNote: This only compares table names, not column structures.');
    }
  }

  console.log('=========================================\n');
}

main().catch(console.error);
