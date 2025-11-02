/**
 * Detailed Database Structure Comparison
 * Compares columns, data types, and constraints between two databases
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

async function getDetailedSchema(dbName) {
  const dbConfig = { ...config, database: dbName };
  const pool = await sql.connect(dbConfig);

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
      COLUMNPROPERTY(OBJECT_ID(t.TABLE_SCHEMA + '.' + t.TABLE_NAME), c.COLUMN_NAME, 'IsIdentity') as IS_IDENTITY,
      c.ORDINAL_POSITION
    FROM INFORMATION_SCHEMA.TABLES t
    LEFT JOIN INFORMATION_SCHEMA.COLUMNS c ON t.TABLE_NAME = c.TABLE_NAME
    WHERE t.TABLE_TYPE = 'BASE TABLE'
      AND t.TABLE_NAME NOT IN ('sysdiagrams')
    ORDER BY t.TABLE_NAME, c.ORDINAL_POSITION;
  `;

  const result = await pool.request().query(query);
  await pool.close();

  // Organize by table
  const tables = {};
  result.recordset.forEach(row => {
    const tableName = row.TABLE_NAME;
    if (!tables[tableName]) {
      tables[tableName] = [];
    }
    if (row.COLUMN_NAME) {
      tables[tableName].push({
        name: row.COLUMN_NAME,
        type: row.DATA_TYPE,
        maxLength: row.CHARACTER_MAXIMUM_LENGTH,
        precision: row.NUMERIC_PRECISION,
        scale: row.NUMERIC_SCALE,
        nullable: row.IS_NULLABLE,
        default: row.COLUMN_DEFAULT,
        identity: row.IS_IDENTITY === 1,
        position: row.ORDINAL_POSITION
      });
    }
  });

  return tables;
}

function formatColumnDef(col) {
  let def = `${col.type}`;

  if (['varchar', 'nvarchar', 'char', 'nchar'].includes(col.type.toLowerCase())) {
    const len = col.maxLength === -1 ? 'MAX' : col.maxLength;
    def += `(${len})`;
  } else if (['decimal', 'numeric'].includes(col.type.toLowerCase())) {
    def += `(${col.precision}, ${col.scale})`;
  }

  if (col.identity) def += ' IDENTITY';
  if (col.nullable === 'NO') def += ' NOT NULL';
  if (col.default) def += ` DEFAULT ${col.default}`;

  return def;
}

function compareColumns(col1, col2) {
  return (
    col1.type === col2.type &&
    col1.maxLength === col2.maxLength &&
    col1.precision === col2.precision &&
    col1.scale === col2.scale &&
    col1.nullable === col2.nullable &&
    col1.default === col2.default &&
    col1.identity === col2.identity
  );
}

async function main() {
  console.log('=========================================');
  console.log('Detailed Database Structure Comparison');
  console.log('=========================================\n');

  console.log('Analyzing main01 database...');
  const db1Schema = await getDetailedSchema('main01');

  console.log('Analyzing ggdbmain01 database...\n');
  const db2Schema = await getDetailedSchema('ggdbmain01');

  console.log('=========================================');
  console.log('Comparison Results:');
  console.log('=========================================\n');

  let totalDifferences = 0;
  let identicalTables = 0;

  const allTables = new Set([...Object.keys(db1Schema), ...Object.keys(db2Schema)]);

  for (const tableName of Array.from(allTables).sort()) {
    const cols1 = db1Schema[tableName] || [];
    const cols2 = db2Schema[tableName] || [];

    if (cols1.length === 0 || cols2.length === 0) {
      console.log(`\n⚠ Table: ${tableName}`);
      if (cols1.length === 0) {
        console.log('  Missing in main01');
      } else {
        console.log('  Missing in ggdbmain01');
      }
      totalDifferences++;
      continue;
    }

    // Compare columns
    const differences = [];
    const col1Names = cols1.map(c => c.name);
    const col2Names = cols2.map(c => c.name);

    // Find missing columns
    const onlyIn1 = col1Names.filter(n => !col2Names.includes(n));
    const onlyIn2 = col2Names.filter(n => !col1Names.includes(n));

    if (onlyIn1.length > 0) {
      onlyIn1.forEach(colName => {
        const col = cols1.find(c => c.name === colName);
        differences.push(`  ✗ Column only in main01: ${colName} ${formatColumnDef(col)}`);
      });
    }

    if (onlyIn2.length > 0) {
      onlyIn2.forEach(colName => {
        const col = cols2.find(c => c.name === colName);
        differences.push(`  ✗ Column only in ggdbmain01: ${colName} ${formatColumnDef(col)}`);
      });
    }

    // Compare common columns
    const commonCols = col1Names.filter(n => col2Names.includes(n));
    commonCols.forEach(colName => {
      const col1 = cols1.find(c => c.name === colName);
      const col2 = cols2.find(c => c.name === colName);

      if (!compareColumns(col1, col2)) {
        differences.push(`  ⚠ Column differs: ${colName}`);
        differences.push(`    main01:      ${formatColumnDef(col1)}`);
        differences.push(`    ggdbmain01:  ${formatColumnDef(col2)}`);
      }
    });

    if (differences.length > 0) {
      console.log(`\n⚠ Table: ${tableName} (${cols1.length} vs ${cols2.length} columns)`);
      differences.forEach(diff => console.log(diff));
      totalDifferences++;
    } else {
      identicalTables++;
    }
  }

  console.log('\n=========================================');
  console.log('Summary:');
  console.log('=========================================');
  console.log(`Total tables: ${allTables.size}`);
  console.log(`Identical tables: ${identicalTables}`);
  console.log(`Tables with differences: ${totalDifferences}`);

  if (totalDifferences === 0) {
    console.log('\n✓ DATABASES ARE STRUCTURALLY IDENTICAL!');
  } else {
    console.log(`\n⚠ Found ${totalDifferences} table(s) with differences`);
  }
  console.log('=========================================\n');
}

main().catch(console.error);
