/**
 * Schema Comparison Tool
 * Compares local and live databases to generate ALTER TABLE statements
 * for missing tables and columns
 */

require('dotenv').config();
const sql = require('mssql');
const fs = require('fs');
const path = require('path');

// Configuration for local database
const localConfig = {
  user: process.env.LOCAL_DB_USER || process.env.DB_USER,
  password: process.env.LOCAL_DB_PASSWORD || process.env.DB_PASSWORD,
  server: process.env.LOCAL_DB_SERVER || 'localhost',
  database: process.env.LOCAL_DB_DATABASE,
  options: {
    encrypt: process.env.LOCAL_DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.LOCAL_DB_TRUST_SERVER_CERTIFICATE !== 'false',
    enableArithAbort: true
  },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  connectionTimeout: 30000,
  requestTimeout: 30000
};

// Configuration for live database (current .env settings)
const liveConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE !== 'false',
    enableArithAbort: true
  },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  connectionTimeout: 30000,
  requestTimeout: 30000
};

/**
 * Get all tables and their columns from a database
 */
async function getDatabaseSchema(pool) {
  const query = `
    SELECT
      t.TABLE_NAME,
      c.COLUMN_NAME,
      c.DATA_TYPE,
      c.CHARACTER_MAXIMUM_LENGTH,
      c.NUMERIC_PRECISION,
      c.NUMERIC_SCALE,
      c.IS_NULLABLE,
      c.COLUMN_DEFAULT,
      COLUMNPROPERTY(OBJECT_ID(t.TABLE_SCHEMA + '.' + t.TABLE_NAME), c.COLUMN_NAME, 'IsIdentity') as IS_IDENTITY
    FROM INFORMATION_SCHEMA.TABLES t
    LEFT JOIN INFORMATION_SCHEMA.COLUMNS c ON t.TABLE_NAME = c.TABLE_NAME
    WHERE t.TABLE_TYPE = 'BASE TABLE'
      AND t.TABLE_NAME NOT IN ('sysdiagrams')
    ORDER BY t.TABLE_NAME, c.ORDINAL_POSITION;
  `;

  const result = await pool.request().query(query);
  return result.recordset;
}

/**
 * Get table primary keys
 */
async function getTableKeys(pool) {
  const query = `
    SELECT
      tc.TABLE_NAME,
      kcu.COLUMN_NAME,
      tc.CONSTRAINT_NAME
    FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
    JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
      ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
    WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
    ORDER BY tc.TABLE_NAME, kcu.ORDINAL_POSITION;
  `;

  const result = await pool.request().query(query);
  return result.recordset;
}

/**
 * Organize schema data by table
 */
function organizeSchema(schemaData, keyData) {
  const tables = {};

  schemaData.forEach(row => {
    const tableName = row.TABLE_NAME;
    if (!tables[tableName]) {
      tables[tableName] = { columns: {}, primaryKeys: [] };
    }

    if (row.COLUMN_NAME) {
      tables[tableName].columns[row.COLUMN_NAME] = {
        dataType: row.DATA_TYPE,
        maxLength: row.CHARACTER_MAXIMUM_LENGTH,
        precision: row.NUMERIC_PRECISION,
        scale: row.NUMERIC_SCALE,
        isNullable: row.IS_NULLABLE === 'YES',
        defaultValue: row.COLUMN_DEFAULT,
        isIdentity: row.IS_IDENTITY === 1
      };
    }
  });

  keyData.forEach(row => {
    if (tables[row.TABLE_NAME]) {
      tables[row.TABLE_NAME].primaryKeys.push(row.COLUMN_NAME);
    }
  });

  return tables;
}

/**
 * Generate SQL data type string
 */
function getDataTypeString(column) {
  let dataType = column.dataType.toUpperCase();

  if (['VARCHAR', 'NVARCHAR', 'CHAR', 'NCHAR'].includes(dataType)) {
    const length = column.maxLength === -1 ? 'MAX' : column.maxLength;
    dataType += `(${length})`;
  } else if (['DECIMAL', 'NUMERIC'].includes(dataType)) {
    dataType += `(${column.precision}, ${column.scale})`;
  }

  return dataType;
}

/**
 * Compare schemas and generate SQL
 */
function compareSchemas(localSchema, liveSchema) {
  const sql = [];
  const localTables = Object.keys(localSchema);
  const liveTables = Object.keys(liveSchema);

  // Find missing tables
  const missingTables = localTables.filter(t => !liveTables.includes(t));

  // Find missing columns in existing tables
  const existingTables = localTables.filter(t => liveTables.includes(t));

  // Generate CREATE TABLE statements for missing tables
  missingTables.forEach(tableName => {
    const table = localSchema[tableName];
    const columns = Object.keys(table.columns);

    let createStatement = `-- Create missing table: ${tableName}\n`;
    createStatement += `CREATE TABLE [dbo].[${tableName}] (\n`;

    const columnDefs = columns.map(colName => {
      const col = table.columns[colName];
      let def = `  [${colName}] ${getDataTypeString(col)}`;

      if (col.isIdentity) {
        def += ' IDENTITY(1,1)';
      }

      if (!col.isNullable) {
        def += ' NOT NULL';
      }

      if (col.defaultValue && !col.isIdentity) {
        def += ` DEFAULT ${col.defaultValue}`;
      }

      return def;
    });

    createStatement += columnDefs.join(',\n');

    // Add primary key constraint if exists
    if (table.primaryKeys.length > 0) {
      const pkCols = table.primaryKeys.map(pk => `[${pk}]`).join(', ');
      createStatement += `,\n  CONSTRAINT [PK_${tableName}] PRIMARY KEY CLUSTERED (${pkCols})`;
    }

    createStatement += '\n);\n';
    sql.push(createStatement);
  });

  // Generate ALTER TABLE statements for missing columns
  existingTables.forEach(tableName => {
    const localCols = localSchema[tableName].columns;
    const liveCols = liveSchema[tableName].columns;

    const localColNames = Object.keys(localCols);
    const liveColNames = Object.keys(liveCols);

    const missingCols = localColNames.filter(c => !liveColNames.includes(c));

    if (missingCols.length > 0) {
      sql.push(`-- Add missing columns to table: ${tableName}`);

      missingCols.forEach(colName => {
        const col = localCols[colName];
        let alterStatement = `ALTER TABLE [dbo].[${tableName}] ADD [${colName}] ${getDataTypeString(col)}`;

        if (!col.isNullable) {
          // For NOT NULL columns, we need to handle existing data
          if (col.defaultValue) {
            alterStatement += ` NOT NULL DEFAULT ${col.defaultValue}`;
          } else {
            alterStatement += ' NULL; -- WARNING: Column is NOT NULL in source but added as NULL for existing data';
          }
        }

        if (col.defaultValue && col.isNullable) {
          alterStatement += ` DEFAULT ${col.defaultValue}`;
        }

        alterStatement += ';';
        sql.push(alterStatement);
      });

      sql.push(''); // Empty line for readability
    }
  });

  return sql;
}

/**
 * Main execution
 */
async function main() {
  console.log('===================================');
  console.log('Database Schema Comparison Tool');
  console.log('===================================\n');

  let localPool, livePool;

  try {
    // Connect to local database
    console.log('Connecting to LOCAL database...');
    console.log(`Server: ${localConfig.server}`);
    console.log(`Database: ${localConfig.database}\n`);

    localPool = await sql.connect(localConfig);
    console.log('✓ Connected to local database\n');

    // Connect to live database
    console.log('Connecting to LIVE database...');
    console.log(`Server: ${liveConfig.server}`);
    console.log(`Database: ${liveConfig.database}\n`);

    livePool = new sql.ConnectionPool(liveConfig);
    await livePool.connect();
    console.log('✓ Connected to live database\n');

    // Get schemas
    console.log('Fetching LOCAL database schema...');
    const localSchemaData = await getDatabaseSchema(localPool);
    const localKeyData = await getTableKeys(localPool);
    const localSchema = organizeSchema(localSchemaData, localKeyData);
    console.log(`✓ Found ${Object.keys(localSchema).length} tables in local database\n`);

    console.log('Fetching LIVE database schema...');
    const liveSchemaData = await getDatabaseSchema(livePool);
    const liveKeyData = await getTableKeys(livePool);
    const liveSchema = organizeSchema(liveSchemaData, liveKeyData);
    console.log(`✓ Found ${Object.keys(liveSchema).length} tables in live database\n`);

    // Compare schemas
    console.log('Comparing schemas...');
    const sqlStatements = compareSchemas(localSchema, liveSchema);

    if (sqlStatements.length === 0) {
      console.log('\n✓ No differences found! Databases are in sync.\n');
    } else {
      console.log(`\n✓ Found differences! Generated ${sqlStatements.length} SQL statements.\n`);

      // Save to file
      const outputFile = path.join(__dirname, 'sync-schema.sql');
      const header = `-- Schema Sync Script
-- Generated: ${new Date().toISOString()}
-- Source: ${localConfig.database} on ${localConfig.server}
-- Target: ${liveConfig.database} on ${liveConfig.server}
--
-- IMPORTANT: Review this script before executing!
-- Backup your database before applying changes.
--

USE [${liveConfig.database}];
GO

`;

      fs.writeFileSync(outputFile, header + sqlStatements.join('\n') + '\n');
      console.log(`SQL script saved to: ${outputFile}\n`);

      // Display preview
      console.log('--- SQL Preview (first 20 lines) ---');
      const preview = sqlStatements.slice(0, 20).join('\n');
      console.log(preview);

      if (sqlStatements.length > 20) {
        console.log(`\n... (${sqlStatements.length - 20} more lines) ...\n`);
      }

      console.log('\n--- Next Steps ---');
      console.log('1. Review the generated SQL file: sync-schema.sql');
      console.log('2. Backup your live database');
      console.log('3. Execute the script on your live database');
      console.log('4. Test your application thoroughly\n');
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  } finally {
    // Close connections
    if (localPool) await localPool.close();
    if (livePool) await livePool.close();
    console.log('✓ Database connections closed\n');
  }
}

// Run the script
main().catch(console.error);
