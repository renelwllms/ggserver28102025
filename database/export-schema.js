/**
 * Export Database Schema
 * Exports complete CREATE TABLE statements from a database
 * Useful when you can't connect to both databases simultaneously
 */

require('dotenv').config();
const sql = require('mssql');
const fs = require('fs');
const path = require('path');

// Database configuration
const dbConfig = {
  user: process.env.LOCAL_DB_USER || process.env.DB_USER,
  password: process.env.LOCAL_DB_PASSWORD || process.env.DB_PASSWORD,
  server: process.env.LOCAL_DB_SERVER || process.env.DB_SERVER,
  database: process.env.LOCAL_DB_DATABASE || process.env.DB_DATABASE,
  options: {
    encrypt: process.env.LOCAL_DB_ENCRYPT === 'true' || process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.LOCAL_DB_TRUST_SERVER_CERTIFICATE !== 'false',
    enableArithAbort: true
  },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  connectionTimeout: 30000,
  requestTimeout: 30000
};

/**
 * Get complete schema information
 */
async function getCompleteSchema(pool) {
  const query = `
    SELECT
      t.TABLE_NAME,
      c.COLUMN_NAME,
      c.ORDINAL_POSITION,
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
 * Get primary keys
 */
async function getPrimaryKeys(pool) {
  const query = `
    SELECT
      tc.TABLE_NAME,
      kcu.COLUMN_NAME,
      kcu.ORDINAL_POSITION
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
 * Get foreign keys
 */
async function getForeignKeys(pool) {
  const query = `
    SELECT
      fk.name AS FK_NAME,
      tp.name AS TABLE_NAME,
      cp.name AS COLUMN_NAME,
      tr.name AS REFERENCED_TABLE,
      cr.name AS REFERENCED_COLUMN
    FROM sys.foreign_keys AS fk
    INNER JOIN sys.tables AS tp ON fk.parent_object_id = tp.object_id
    INNER JOIN sys.tables AS tr ON fk.referenced_object_id = tr.object_id
    INNER JOIN sys.foreign_key_columns AS fkc ON fkc.constraint_object_id = fk.object_id
    INNER JOIN sys.columns AS cp ON fkc.parent_column_id = cp.column_id AND fkc.parent_object_id = cp.object_id
    INNER JOIN sys.columns AS cr ON fkc.referenced_column_id = cr.column_id AND fkc.referenced_object_id = cr.object_id
    ORDER BY tp.name, fk.name;
  `;

  const result = await pool.request().query(query);
  return result.recordset;
}

/**
 * Generate SQL data type string
 */
function getDataTypeString(column) {
  let dataType = column.DATA_TYPE.toUpperCase();

  if (['VARCHAR', 'NVARCHAR', 'CHAR', 'NCHAR'].includes(dataType)) {
    const length = column.CHARACTER_MAXIMUM_LENGTH === -1 ? 'MAX' : column.CHARACTER_MAXIMUM_LENGTH;
    dataType += `(${length})`;
  } else if (['DECIMAL', 'NUMERIC'].includes(dataType)) {
    dataType += `(${column.NUMERIC_PRECISION}, ${column.NUMERIC_SCALE})`;
  }

  return dataType;
}

/**
 * Generate CREATE TABLE statements
 */
function generateCreateStatements(schema, primaryKeys, foreignKeys) {
  const sql = [];
  const tables = {};

  // Organize by table
  schema.forEach(row => {
    if (!row.TABLE_NAME) return;

    if (!tables[row.TABLE_NAME]) {
      tables[row.TABLE_NAME] = [];
    }
    if (row.COLUMN_NAME) {
      tables[row.TABLE_NAME].push(row);
    }
  });

  // Organize primary keys
  const pksByTable = {};
  primaryKeys.forEach(pk => {
    if (!pksByTable[pk.TABLE_NAME]) {
      pksByTable[pk.TABLE_NAME] = [];
    }
    pksByTable[pk.TABLE_NAME].push(pk.COLUMN_NAME);
  });

  // Organize foreign keys
  const fksByTable = {};
  foreignKeys.forEach(fk => {
    if (!fksByTable[fk.TABLE_NAME]) {
      fksByTable[fk.TABLE_NAME] = [];
    }
    fksByTable[fk.TABLE_NAME].push(fk);
  });

  // Generate CREATE statements
  Object.keys(tables).sort().forEach(tableName => {
    const columns = tables[tableName];

    sql.push(`-- Table: ${tableName}`);
    sql.push(`IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[${tableName}]') AND type in (N'U'))`);
    sql.push('BEGIN');
    sql.push(`  CREATE TABLE [dbo].[${tableName}] (`);

    const columnDefs = columns.map(col => {
      let def = `    [${col.COLUMN_NAME}] ${getDataTypeString(col)}`;

      if (col.IS_IDENTITY === 1) {
        def += ' IDENTITY(1,1)';
      }

      if (col.IS_NULLABLE === 'NO') {
        def += ' NOT NULL';
      }

      if (col.COLUMN_DEFAULT && col.IS_IDENTITY !== 1) {
        def += ` DEFAULT ${col.COLUMN_DEFAULT}`;
      }

      return def;
    });

    sql.push(columnDefs.join(',\n'));

    // Add primary key
    if (pksByTable[tableName] && pksByTable[tableName].length > 0) {
      const pkCols = pksByTable[tableName].map(pk => `[${pk}]`).join(', ');
      sql.push(`,    CONSTRAINT [PK_${tableName}] PRIMARY KEY CLUSTERED (${pkCols})`);
    }

    sql.push('  );');
    sql.push('END');
    sql.push('GO\n');
  });

  // Add foreign keys separately
  if (Object.keys(fksByTable).length > 0) {
    sql.push('-- Foreign Keys');
    Object.keys(fksByTable).sort().forEach(tableName => {
      fksByTable[tableName].forEach(fk => {
        sql.push(`IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = '${fk.FK_NAME}')`);
        sql.push('BEGIN');
        sql.push(`  ALTER TABLE [dbo].[${fk.TABLE_NAME}]`);
        sql.push(`    ADD CONSTRAINT [${fk.FK_NAME}] FOREIGN KEY ([${fk.COLUMN_NAME}])`);
        sql.push(`    REFERENCES [dbo].[${fk.REFERENCED_TABLE}] ([${fk.REFERENCED_COLUMN}]);`);
        sql.push('END');
        sql.push('GO\n');
      });
    });
  }

  return sql;
}

/**
 * Main execution
 */
async function main() {
  console.log('===================================');
  console.log('Database Schema Export Tool');
  console.log('===================================\n');

  let pool;

  try {
    // Connect to database
    console.log('Connecting to database...');
    console.log(`Server: ${dbConfig.server}`);
    console.log(`Database: ${dbConfig.database}\n`);

    pool = await sql.connect(dbConfig);
    console.log('✓ Connected to database\n');

    // Get schema
    console.log('Fetching schema...');
    const schema = await getCompleteSchema(pool);
    const primaryKeys = await getPrimaryKeys(pool);
    const foreignKeys = await getForeignKeys(pool);

    const tables = [...new Set(schema.map(s => s.TABLE_NAME).filter(t => t))];
    console.log(`✓ Found ${tables.length} tables\n`);

    // Generate SQL
    console.log('Generating CREATE statements...');
    const sqlStatements = generateCreateStatements(schema, primaryKeys, foreignKeys);

    // Save to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const outputFile = path.join(__dirname, `schema-export-${timestamp}.sql`);

    const header = `-- Database Schema Export
-- Generated: ${new Date().toISOString()}
-- Database: ${dbConfig.database}
-- Server: ${dbConfig.server}
--
-- This script creates all tables with IF NOT EXISTS checks
-- Safe to run multiple times
--

USE [${dbConfig.database}];
GO

`;

    fs.writeFileSync(outputFile, header + sqlStatements.join('\n') + '\n');
    console.log(`✓ Schema exported to: ${outputFile}\n`);

    // Display summary
    console.log('--- Summary ---');
    console.log(`Tables exported: ${tables.length}`);
    console.log(`Total SQL lines: ${sqlStatements.length}`);
    console.log('\nTables:');
    tables.forEach(table => console.log(`  - ${table}`));

    console.log('\n--- Next Steps ---');
    console.log('1. Review the exported SQL file');
    console.log('2. You can run this on any SQL Server database');
    console.log('3. Or manually extract specific tables you need\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  } finally {
    if (pool) await pool.close();
    console.log('✓ Database connection closed\n');
  }
}

// Run the script
main().catch(console.error);
