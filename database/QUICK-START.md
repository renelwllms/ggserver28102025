# Quick Start: Sync Local Database Changes to Live

## Choose Your Method

### Method 1: Automated Comparison (Recommended)
**Best if:** You can connect to both databases from this machine

```bash
# 1. Add local DB credentials to .env
nano ~/server/.env
# Add: LOCAL_DB_USER, LOCAL_DB_PASSWORD, LOCAL_DB_SERVER, LOCAL_DB_DATABASE

# 2. Run comparison
cd ~/server/database
node compare-schemas.js

# 3. Review generated file
cat sync-schema.sql

# 4. Apply to live database (using SSMS or sqlcmd)
```

**Pros:** Automatic, only syncs differences, safe
**Cons:** Requires connection to both databases

---

### Method 2: Export Schema from Local
**Best if:** You can't connect to local database remotely

```bash
# On your LOCAL development machine:
# 1. Install dependencies
cd /path/to/your/project/server
npm install

# 2. Set up local DB credentials in .env
LOCAL_DB_USER=your_user
LOCAL_DB_PASSWORD=your_pass
LOCAL_DB_SERVER=localhost
LOCAL_DB_DATABASE=your_local_db

# 3. Export schema
node database/export-schema.js

# 4. Copy the generated file to this Ubuntu machine
# Example: schema-export-2024-11-01T12-30-00.sql

# 5. Review and manually apply needed parts to live DB
```

**Pros:** Works without remote access to local DB
**Cons:** Manual review needed, exports everything

---

### Method 3: Manual using SSMS Schema Compare
**Best if:** You have SQL Server Management Studio

1. Open SSMS
2. Tools → SQL Server → Schema Compare
3. Source: Your local database
4. Target: Live database (192.168.1.175)
5. Click "Compare"
6. Review differences
7. Generate Script
8. Execute on live database

**Pros:** Visual interface, very reliable
**Cons:** Requires SSMS installed

---

### Method 4: Manual SQL Scripts
**Best if:** You know exactly what tables/fields you added

1. Create a file: `manual-changes.sql`
2. Write your ALTER TABLE statements:
   ```sql
   -- Add new table
   CREATE TABLE [dbo].[NewTable] (
     [ID] INT IDENTITY(1,1) PRIMARY KEY,
     [Name] NVARCHAR(255) NOT NULL
   );

   -- Add new column
   ALTER TABLE [dbo].[ExistingTable]
   ADD [NewColumn] NVARCHAR(100) NULL;
   ```
3. Review carefully
4. Execute on live database

**Pros:** Full control, simple
**Cons:** Manual work, error-prone

---

## What I Recommend

**For you:** Use **Method 1** (Automated Comparison)

Since you're on the live server already, just add your local DB credentials to .env and run the comparison script. It will show you exactly what's different and generate the SQL for you.

## Files Created

- `compare-schemas.js` - Automated comparison tool
- `export-schema.js` - Schema export tool
- `SCHEMA-SYNC-GUIDE.md` - Detailed documentation
- `QUICK-START.md` - This file

## Need Help?

Read the full guide:
```bash
cat ~/server/database/SCHEMA-SYNC-GUIDE.md
```
