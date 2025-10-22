# Database Performance Optimization

This directory contains SQL scripts to optimize database performance for the learner management system.

## Files

- **add-indexes.sql** - Creates database indexes to improve query performance

## Problem

The learner search page (`/api/student/list`) was experiencing slow load times when fetching all learners from the database. This was caused by:

1. **Full table scans** - No indexes on frequently queried columns
2. **LIKE searches** - Searching on FirstName, LastName, and School without indexes
3. **Multiple filter conditions** - Status, AssignedTo, FollowUp filters without optimization
4. **Large result sets** - Returning all learners without efficient pagination

## Solution

The `add-indexes.sql` script creates 8 strategic indexes to dramatically improve query performance:

### Indexes Created

1. **IX_tblStudentInfo_Names** - Speeds up name searches (FirstName, LastName)
2. **IX_tblStudentInfo_School** - Optimizes school name filtering
3. **IX_tblStudentInfo_AssignedTo** - Fast filtering by assignment (School/GET Group)
4. **IX_tblStudentInfo_Status** - Quick status filtering (On Going, Completed, etc.)
5. **IX_tblStudentInfo_LastCommDate** - Efficient follow-up date filtering
6. **IX_tblStudentInfo_IsDeleted** - Filtered index to exclude deleted records
7. **IX_tblStudentInfo_Composite** - Covers common multi-filter queries
8. **IX_tblStudentInfo_Email** - Speeds up "My Students" page filtering by email

### Performance Improvements Expected

- **Initial load**: 3-10x faster for large datasets (1000+ learners)
- **Filtered searches**: 5-20x faster when using status, assignment, or name filters
- **Follow-up queries**: 10-50x faster for date-based filtering
- **Pagination**: Significantly improved for large result sets

## How to Apply

### Prerequisites

- Access to the MS SQL Server database
- Database administrator permissions
- SQL Server Management Studio (SSMS) or Azure Data Studio

### Step 1: Backup Database

**IMPORTANT**: Always backup your database before making schema changes.

```sql
-- In SSMS, right-click the database
-- Select Tasks > Back Up...
-- Or run:
BACKUP DATABASE [YourDatabaseName]
TO DISK = 'C:\Backups\YourDatabaseName_BeforeIndexes.bak'
WITH FORMAT, INIT, NAME = 'Full Backup Before Adding Indexes';
```

### Step 2: Update Database Name

1. Open `add-indexes.sql` in a text editor or SSMS
2. Replace `[YourDatabaseName]` on line 12 with your actual database name
   ```sql
   USE [YourActualDatabaseName];  -- Change this line
   ```

### Step 3: Run the Script

#### Option A: Using SQL Server Management Studio (SSMS)

1. Open SSMS and connect to your database server
2. Click **File > Open > File**
3. Navigate to and open `add-indexes.sql`
4. Ensure the correct database is selected in the dropdown
5. Click **Execute** (or press F5)
6. Review the messages tab for confirmation

#### Option B: Using Azure Data Studio

1. Open Azure Data Studio and connect to your server
2. Click **File > Open File**
3. Select `add-indexes.sql`
4. Right-click in the query window and select **Run**
5. Check the results pane for success messages

#### Option C: Using Command Line (sqlcmd)

```bash
sqlcmd -S your_server_name -d your_database_name -i add-indexes.sql -o index_creation_log.txt
```

### Step 4: Verify Indexes

After running the script, verify the indexes were created:

```sql
-- Check all indexes on tblStudentInfo
SELECT
    i.name AS IndexName,
    i.type_desc AS IndexType,
    STUFF((
        SELECT ', ' + c.name
        FROM sys.index_columns ic
        INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
        WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 0
        ORDER BY ic.key_ordinal
        FOR XML PATH('')
    ), 1, 2, '') AS KeyColumns
FROM sys.indexes i
WHERE i.object_id = OBJECT_ID('tblStudentInfo')
    AND i.type > 0
ORDER BY i.name;
```

### Step 5: Test Performance

1. Restart the Node.js backend server
2. Open the learner search page in the browser
3. Check the network tab - API response time should be significantly faster
4. Try different filters to verify improved performance

## Expected Output

When the script runs successfully, you should see messages like:

```
Created index: IX_tblStudentInfo_Names
Created index: IX_tblStudentInfo_School
Created index: IX_tblStudentInfo_AssignedTo
Created index: IX_tblStudentInfo_Status
Created index: IX_tblStudentInfo_LastCommDate
Created index: IX_tblStudentInfo_IsDeleted (filtered)
Created index: IX_tblStudentInfo_Composite
Created index: IX_tblStudentInfo_Email
Updated statistics for tblStudentInfo
========================================
Index creation completed successfully!
========================================
```

## Monitoring Performance

### Check Query Execution Plans

```sql
SET STATISTICS IO ON;
SET STATISTICS TIME ON;

-- Run your typical learner search query
SELECT * FROM tblStudentInfo
WHERE (FirstName LIKE 'John%' OR LastName LIKE 'John%')
  AND (IsDeleted IS NULL OR IsDeleted = 0);

SET STATISTICS IO OFF;
SET STATISTICS TIME OFF;
```

### Monitor Index Usage

```sql
-- See which indexes are being used
SELECT
    OBJECT_NAME(s.object_id) AS TableName,
    i.name AS IndexName,
    s.user_seeks,
    s.user_scans,
    s.user_lookups,
    s.user_updates
FROM sys.dm_db_index_usage_stats s
INNER JOIN sys.indexes i ON s.object_id = i.object_id AND s.index_id = i.index_id
WHERE OBJECT_NAME(s.object_id) = 'tblStudentInfo'
ORDER BY s.user_seeks + s.user_scans + s.user_lookups DESC;
```

## Maintenance

### Rebuild Indexes (Quarterly)

Indexes should be rebuilt periodically to maintain performance:

```sql
-- Rebuild all indexes on tblStudentInfo
ALTER INDEX ALL ON tblStudentInfo REBUILD WITH (ONLINE = ON);

-- Or rebuild specific index
ALTER INDEX IX_tblStudentInfo_Composite ON tblStudentInfo REBUILD WITH (ONLINE = ON);
```

### Update Statistics (Monthly)

```sql
-- Update statistics to help query optimizer
UPDATE STATISTICS tblStudentInfo WITH FULLSCAN;
```

## Troubleshooting

### Issue: "Cannot create index because...already exists"

**Solution**: The script checks for existing indexes. If you see this message, the index already exists and doesn't need to be recreated.

### Issue: "Insufficient permissions"

**Solution**: You need `ALTER` permission on the table. Contact your database administrator.

```sql
-- Grant necessary permissions (run as admin)
GRANT ALTER ON tblStudentInfo TO [YourUsername];
```

### Issue: "Cannot execute as the database principal because...is a schema"

**Solution**: Check the database name in the `USE` statement is correct.

### Issue: Index creation is very slow

**Solution**:
- For large tables, index creation can take several minutes
- The script uses `ONLINE = ON` to allow concurrent access
- If timeout occurs, try creating indexes one at a time

## Rollback

If you need to remove the indexes:

```sql
-- Remove all custom indexes
DROP INDEX IF EXISTS IX_tblStudentInfo_Names ON tblStudentInfo;
DROP INDEX IF EXISTS IX_tblStudentInfo_School ON tblStudentInfo;
DROP INDEX IF EXISTS IX_tblStudentInfo_AssignedTo ON tblStudentInfo;
DROP INDEX IF EXISTS IX_tblStudentInfo_Status ON tblStudentInfo;
DROP INDEX IF EXISTS IX_tblStudentInfo_LastCommDate ON tblStudentInfo;
DROP INDEX IF EXISTS IX_tblStudentInfo_IsDeleted ON tblStudentInfo;
DROP INDEX IF EXISTS IX_tblStudentInfo_Composite ON tblStudentInfo;
DROP INDEX IF EXISTS IX_tblStudentInfo_Email ON tblStudentInfo;
```

## Additional Optimization Tips

1. **Increase page size on frontend** - Load 20-50 records per page instead of 10
2. **Add caching** - Implement Redis or in-memory caching for frequently accessed data
3. **Use pagination tokens** - Replace offset-based pagination with cursor-based
4. **Monitor slow queries** - Enable query logging to identify bottlenecks
5. **Database connection pooling** - Ensure connection pool is properly sized

## Support

For issues or questions:
1. Check the SQL Server error log
2. Review execution plans for slow queries
3. Monitor index usage statistics
4. Contact your database administrator

## References

- [SQL Server Index Design Guide](https://learn.microsoft.com/en-us/sql/relational-databases/sql-server-index-design-guide)
- [Optimize SQL Server Queries](https://learn.microsoft.com/en-us/sql/relational-databases/performance/optimize-performance-by-using-indexes)
- [Index Maintenance Best Practices](https://learn.microsoft.com/en-us/sql/relational-databases/indexes/reorganize-and-rebuild-indexes)
