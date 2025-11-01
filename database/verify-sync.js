/**
 * Verification Script
 * Checks if all schema changes were applied successfully
 */

const sql = require('mssql');
const path = require('path');
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
  }
};

async function verify() {
  console.log('=========================================');
  console.log('Database Schema Verification');
  console.log('=========================================\n');

  let pool;

  try {
    pool = await sql.connect(config);
    console.log(`✓ Connected to ${config.database}\n`);

    // Check MicroCredential columns
    const microCheck = await pool.request().query(`
      SELECT
        CASE WHEN COL_LENGTH('tblMicroCredentialEligibility', 'GroupName') IS NOT NULL THEN 'YES' ELSE 'NO' END AS HasGroupName,
        CASE WHEN COL_LENGTH('tblMicroCredentialEligibility', 'NotificationEmail') IS NOT NULL THEN 'YES' ELSE 'NO' END AS HasNotificationEmail
    `);

    console.log('1. MicroCredential Eligibility Table:');
    console.log('   GroupName column:', microCheck.recordset[0].HasGroupName);
    console.log('   NotificationEmail column:', microCheck.recordset[0].HasNotificationEmail);
    console.log('');

    // Check Category columns
    const categoryCheck = await pool.request().query(`
      SELECT
        CASE WHEN COL_LENGTH('tblCourse', 'CourseCategory') IS NOT NULL THEN 'YES' ELSE 'NO' END AS HasCourseCategory,
        CASE WHEN COL_LENGTH('tblUnitStandard', 'USCategory') IS NOT NULL THEN 'YES' ELSE 'NO' END AS HasUSCategory
    `);

    console.log('2. Category Columns:');
    console.log('   tblCourse.CourseCategory:', categoryCheck.recordset[0].HasCourseCategory);
    console.log('   tblUnitStandard.USCategory:', categoryCheck.recordset[0].HasUSCategory);
    console.log('');

    // Check indexes
    const indexCheck = await pool.request().query(`
      SELECT name, type_desc
      FROM sys.indexes
      WHERE object_id = OBJECT_ID('tblStudentInfo')
        AND type > 0
        AND name LIKE 'IX_tblStudentInfo_%'
      ORDER BY name
    `);

    console.log('3. Performance Indexes on tblStudentInfo:');
    console.log(`   Total indexes: ${indexCheck.recordset.length}`);
    indexCheck.recordset.forEach(idx => {
      console.log(`   ✓ ${idx.name} (${idx.type_desc})`);
    });
    console.log('');

    // Summary
    const allGood =
      microCheck.recordset[0].HasGroupName === 'YES' &&
      microCheck.recordset[0].HasNotificationEmail === 'YES' &&
      categoryCheck.recordset[0].HasCourseCategory === 'YES' &&
      categoryCheck.recordset[0].HasUSCategory === 'YES' &&
      indexCheck.recordset.length >= 8;

    console.log('=========================================');
    if (allGood) {
      console.log('✓ ALL SCHEMA CHANGES APPLIED SUCCESSFULLY!');
    } else {
      console.log('⚠ SOME CHANGES MISSING - Review above');
    }
    console.log('=========================================\n');

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    if (pool) await pool.close();
  }
}

verify().catch(console.error);
