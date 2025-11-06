// Script to create the notification settings table
require('dotenv').config();
const sql = require('mssql');

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
    instanceName: process.env.DB_INSTANCE_NAME,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

async function createTable() {
  console.log('Connecting to database...');
  console.log(`Server: ${config.server}\\${config.options.instanceName}`);
  console.log(`Database: ${config.database}`);
  console.log(`User: ${config.user}`);

  try {
    const pool = await sql.connect(config);
    console.log('✓ Connected to database successfully\n');

    // Check if old table exists
    console.log('Checking for old table...');
    const checkOldTable = await pool.request().query(`
      SELECT OBJECT_ID(N'[dbo].[tblRemoteRegistrationCategorySettings]', N'U') as TableExists
    `);

    if (checkOldTable.recordset[0].TableExists) {
      console.log('✓ Old table tblRemoteRegistrationCategorySettings found');

      // Get any existing email from old table
      const oldData = await pool.request().query(`
        SELECT TOP 1 NotificationEmail
        FROM tblRemoteRegistrationCategorySettings
        WHERE NotificationEmail IS NOT NULL
      `);

      const existingEmail = oldData.recordset[0]?.NotificationEmail;
      if (existingEmail) {
        console.log(`✓ Found existing email: ${existingEmail}`);
      }
    } else {
      console.log('- Old table does not exist');
    }

    // Check if new table exists
    console.log('\nChecking for new table...');
    const checkNewTable = await pool.request().query(`
      SELECT OBJECT_ID(N'[dbo].[tblRemoteRegistrationSettings]', N'U') as TableExists
    `);

    if (checkNewTable.recordset[0].TableExists) {
      console.log('✓ Table tblRemoteRegistrationSettings already exists');

      // Show current value
      const currentData = await pool.request().query(`
        SELECT SettingKey, SettingValue
        FROM tblRemoteRegistrationSettings
        WHERE SettingKey = 'NotificationEmail'
      `);

      if (currentData.recordset.length > 0) {
        console.log(`Current value: ${currentData.recordset[0].SettingValue || 'Not set'}`);
      }
    } else {
      console.log('- Table does not exist, creating...\n');

      // Create new table
      await pool.request().query(`
        CREATE TABLE [dbo].[tblRemoteRegistrationSettings] (
          [SettingKey] NVARCHAR(50) PRIMARY KEY,
          [SettingValue] NVARCHAR(500) NULL,
          [Description] NVARCHAR(255) NULL,
          [UpdatedDate] DATETIME DEFAULT GETDATE(),
          [UpdatedBy] NVARCHAR(100) NULL
        );
      `);
      console.log('✓ Table tblRemoteRegistrationSettings created');

      // Insert initial setting
      await pool.request().query(`
        INSERT INTO [dbo].[tblRemoteRegistrationSettings] ([SettingKey], [SettingValue], [Description])
        VALUES ('NotificationEmail', NULL, 'Email address to receive remote registration notifications');
      `);
      console.log('✓ Initial setting inserted');

      // If there was data in old table, migrate it
      if (checkOldTable.recordset[0].TableExists) {
        const oldData = await pool.request().query(`
          SELECT TOP 1 NotificationEmail
          FROM tblRemoteRegistrationCategorySettings
          WHERE NotificationEmail IS NOT NULL
        `);

        const existingEmail = oldData.recordset[0]?.NotificationEmail;
        if (existingEmail) {
          await pool.request()
            .input('email', sql.VarChar, existingEmail)
            .query(`
              UPDATE tblRemoteRegistrationSettings
              SET SettingValue = @email
              WHERE SettingKey = 'NotificationEmail'
            `);
          console.log(`✓ Migrated email: ${existingEmail}`);
        }

        // Drop old table
        await pool.request().query(`
          DROP TABLE tblRemoteRegistrationCategorySettings
        `);
        console.log('✓ Old table dropped');
      }
    }

    console.log('\n✓ All done! Table is ready to use.');
    await pool.close();
    process.exit(0);

  } catch (error) {
    console.error('\n✗ Error:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

createTable();
