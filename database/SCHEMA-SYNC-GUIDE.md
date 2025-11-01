# Database Schema Synchronization Guide

This guide helps you sync database schema changes from your local development database to the live production database.

## Problem

You developed new features on your local machine with a local database, creating new tables and fields. Now you need to apply those same schema changes to the live database without manually writing SQL.

## Solution

Use the `compare-schemas.js` script to automatically:
1. Compare local and live database schemas
2. Detect missing tables and columns
3. Generate SQL statements to sync the live database

---

## Prerequisites

- Access to both local and live SQL Server databases
- Node.js installed on this machine
- Database credentials for both databases

---

## Step-by-Step Instructions

### Step 1: Add Local Database Credentials to .env

Open the `.env` file and add your **local database** credentials (from your development machine):

```bash
# Add these lines to your existing .env file:
LOCAL_DB_USER=your_local_username
LOCAL_DB_PASSWORD=your_local_password
LOCAL_DB_SERVER=your_local_server_ip_or_localhost
LOCAL_DB_DATABASE=your_local_database_name
LOCAL_DB_ENCRYPT=false
LOCAL_DB_TRUST_SERVER_CERTIFICATE=true
```

**Example:**
```bash
LOCAL_DB_USER=sa
LOCAL_DB_PASSWORD=MyLocalPassword123
LOCAL_DB_SERVER=localhost
LOCAL_DB_DATABASE=ggdb_development
LOCAL_DB_ENCRYPT=false
LOCAL_DB_TRUST_SERVER_CERTIFICATE=true
```

**Important Notes:**
- If your local database is on the same machine you developed on, you'll need to ensure this Ubuntu machine can connect to it
- If local DB is not accessible remotely, see "Alternative: Using SQL Server Management Studio" below
- The existing `DB_*` variables in .env are for the LIVE database (already configured)

### Step 2: Run the Comparison Script

```bash
cd ~/server/database
node compare-schemas.js
```

### Step 3: Review the Output

The script will:
1. Connect to both databases
2. Compare schemas
3. Generate a file called `sync-schema.sql` with all necessary changes
4. Show you a preview of the changes

**Example output:**
```
===================================
Database Schema Comparison Tool
===================================

Connecting to LOCAL database...
Server: localhost
Database: ggdb_development

✓ Connected to local database

Connecting to LIVE database...
Server: 192.168.1.175
Database: ggdbtemp02

✓ Connected to live database

Fetching LOCAL database schema...
✓ Found 15 tables in local database

Fetching LIVE database schema...
✓ Found 12 tables in live database

Comparing schemas...

✓ Found differences! Generated 25 SQL statements.

SQL script saved to: /home/epladmin/server/database/sync-schema.sql

--- SQL Preview (first 20 lines) ---
-- Create missing table: tblNewFeature
CREATE TABLE [dbo].[tblNewFeature] (
  [FeatureID] INT IDENTITY(1,1) NOT NULL,
  [FeatureName] NVARCHAR(255) NOT NULL,
  [CreatedDate] DATETIME NOT NULL DEFAULT GETDATE(),
  CONSTRAINT [PK_tblNewFeature] PRIMARY KEY CLUSTERED ([FeatureID])
);

-- Add missing columns to table: tblStudentInfo
ALTER TABLE [dbo].[tblStudentInfo] ADD [NewField] NVARCHAR(100) NULL;
ALTER TABLE [dbo].[tblStudentInfo] ADD [AnotherField] INT NULL;
```

### Step 4: Review the Generated SQL File

**IMPORTANT:** Always review the SQL before executing!

```bash
cat ~/server/database/sync-schema.sql
```

Check for:
- Correct table names
- Proper data types
- Required fields have appropriate defaults
- No unexpected changes

### Step 5: Backup Live Database

**CRITICAL:** Always backup before making schema changes!

```sql
-- Connect to your live database using SQL Server Management Studio or Azure Data Studio
-- Then run:
BACKUP DATABASE [ggdbtemp02]
TO DISK = 'C:\Backups\ggdbtemp02_before_schema_sync.bak'
WITH FORMAT, INIT, NAME = 'Full Backup Before Schema Sync';
```

Or use your database admin tool to create a backup.

### Step 6: Execute the SQL Script

#### Option A: Using SQL Server Management Studio (SSMS)

1. Open SSMS and connect to `192.168.1.175`
2. Click **File > Open > File**
3. Navigate to and open `sync-schema.sql`
4. Ensure `ggdbtemp02` database is selected
5. Click **Execute** (F5)
6. Review messages for any errors

#### Option B: Using Azure Data Studio

1. Open Azure Data Studio
2. Connect to your live server `192.168.1.175`
3. Click **File > Open File**
4. Select `sync-schema.sql`
5. Right-click and select **Run**
6. Check results pane

#### Option C: Using sqlcmd (Linux/Command Line)

```bash
# Install sqlcmd if not already installed
# sudo apt-get install mssql-tools unixodbc-dev

sqlcmd -S 192.168.1.175 -U ggadmin -P 'b4b5AzU9pPs$$L27' -d ggdbtemp02 -i ~/server/database/sync-schema.sql
```

### Step 7: Verify Changes

After applying the SQL, verify the changes were successful:

```sql
-- Check if new tables exist
SELECT TABLE_NAME
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_TYPE = 'BASE TABLE'
ORDER BY TABLE_NAME;

-- Check columns in a specific table
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'YourNewTableName'
ORDER BY ORDINAL_POSITION;
```

### Step 8: Test Your Application

1. Restart your Node.js server:
   ```bash
   pm2 restart all
   ```

2. Test all functionality that uses the new tables/fields

3. Check application logs for any database errors:
   ```bash
   pm2 logs
   ```

---

## Alternative: Using SQL Server Management Studio

If you cannot connect to your local database remotely, use this manual approach:

### Generate Schema from Local Database

1. Open SSMS and connect to your **local** database
2. Right-click the database > **Tasks** > **Generate Scripts**
3. Select **Specific database objects**
4. Choose the new tables or specific tables with new columns
5. Click **Next** > **Advanced**
6. Set **Script for server version** to match your live SQL Server version
7. Set **Types of data to script** to **Schema only**
8. Set **Script indexes** to **True** (if needed)
9. Save the script to a file (e.g., `new-schema.sql`)

### Generate Comparison Script

1. In SSMS, go to **Tools** > **SQL Server** > **Schema Compare**
2. Set **Source** to your local database
3. Set **Target** to your live database
4. Click **Compare**
5. Review differences
6. Click **Generate Script** to create sync SQL
7. Review and execute the script

---

## Troubleshooting

### Error: "Cannot connect to local database"

**Solution:**
- Ensure your local SQL Server allows remote connections
- Check firewall settings on your local machine
- Verify the local database credentials are correct
- Try connecting using SSMS from this Ubuntu machine first

### Error: "Login failed for user"

**Solution:**
```bash
# Verify credentials in .env
cat ~/server/.env | grep DB_

# Test connection manually
sqlcmd -S 192.168.1.175 -U ggadmin -P 'your_password' -Q "SELECT @@VERSION"
```

### Error: "Cannot ALTER table because of dependencies"

**Solution:**
- Some columns may have foreign key constraints
- Drop constraints first, then add columns, then recreate constraints
- Modify the generated SQL to handle constraints properly

### Warning: "Column is NOT NULL but added as NULL"

**Explanation:**
- When adding a NOT NULL column to a table with existing data, you must provide a default value
- The script adds it as NULL to prevent errors
- You can then update the column and change it to NOT NULL:

```sql
-- First, populate the new column
UPDATE YourTable SET NewColumn = 'DefaultValue';

-- Then make it NOT NULL
ALTER TABLE YourTable ALTER COLUMN NewColumn NVARCHAR(100) NOT NULL;
```

---

## Best Practices

1. **Always backup before schema changes** - Critical for production databases
2. **Test on staging first** - If you have a staging environment, test there first
3. **Review generated SQL** - Don't blindly execute; understand the changes
4. **Apply during low-traffic** - Schedule schema changes during maintenance windows
5. **Keep scripts versioned** - Save sync scripts in git for audit trail
6. **Document changes** - Keep track of what was changed and when

---

## Going Forward: Using Migrations

To prevent this issue in the future, consider implementing a migration system:

### Option 1: Manual Migration Files

Create numbered SQL migration files:
```
database/migrations/
  001_create_initial_tables.sql
  002_add_student_fields.sql
  003_create_feature_table.sql
```

Track which migrations have been applied using a migrations table:
```sql
CREATE TABLE _migrations (
  id INT IDENTITY(1,1) PRIMARY KEY,
  migration_name VARCHAR(255) NOT NULL,
  applied_at DATETIME NOT NULL DEFAULT GETDATE()
);
```

### Option 2: Use an ORM with Migrations

Consider migrating to an ORM like **Sequelize** or **TypeORM** which have built-in migration support:

```bash
npm install sequelize
npx sequelize-cli migration:generate --name add-new-fields
```

---

## Support

If you encounter issues:
1. Check the SQL Server error log
2. Review the generated SQL carefully
3. Test queries individually
4. Verify database permissions
5. Check network connectivity between servers

---

## Current Configuration

**Live Database:**
- Server: `192.168.1.175`
- Database: `ggdbtemp02`
- User: `ggadmin`

**Local Database:**
- Configured via `LOCAL_DB_*` environment variables
- Must be accessible from this Ubuntu machine
