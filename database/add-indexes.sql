-- ================================================================
-- Database Performance Optimization - Add Indexes
-- ================================================================
-- This script adds indexes to improve query performance for the
-- learner search functionality.
--
-- Run this script on your MS SQL Server database to create the indexes.
-- ================================================================

USE [YourDatabaseName];  -- Replace with your actual database name
GO

-- ================================================================
-- 1. Index on FirstName and LastName for name searches
-- ================================================================
-- This composite index speeds up LIKE searches on names
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_tblStudentInfo_Names' AND object_id = OBJECT_ID('tblStudentInfo'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_tblStudentInfo_Names
    ON tblStudentInfo (FirstName, LastName)
    INCLUDE (StudentID, School, AssignedTo, Status, Email, Tutor, Gender, DateOfBirth, Ethnicity, Code, IsDeleted)
    WITH (ONLINE = ON, FILLFACTOR = 90);

    PRINT 'Created index: IX_tblStudentInfo_Names';
END
ELSE
BEGIN
    PRINT 'Index IX_tblStudentInfo_Names already exists';
END
GO

-- ================================================================
-- 2. Index on School for school name searches
-- ================================================================
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_tblStudentInfo_School' AND object_id = OBJECT_ID('tblStudentInfo'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_tblStudentInfo_School
    ON tblStudentInfo (School)
    INCLUDE (FirstName, LastName, StudentID, AssignedTo, Status, IsDeleted)
    WITH (ONLINE = ON, FILLFACTOR = 90);

    PRINT 'Created index: IX_tblStudentInfo_School';
END
ELSE
BEGIN
    PRINT 'Index IX_tblStudentInfo_School already exists';
END
GO

-- ================================================================
-- 3. Index on AssignedTo for filtering by assignment
-- ================================================================
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_tblStudentInfo_AssignedTo' AND object_id = OBJECT_ID('tblStudentInfo'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_tblStudentInfo_AssignedTo
    ON tblStudentInfo (AssignedTo)
    INCLUDE (FirstName, LastName, StudentID, School, Status, IsDeleted)
    WITH (ONLINE = ON, FILLFACTOR = 90);

    PRINT 'Created index: IX_tblStudentInfo_AssignedTo';
END
ELSE
BEGIN
    PRINT 'Index IX_tblStudentInfo_AssignedTo already exists';
END
GO

-- ================================================================
-- 4. Index on Status for filtering by learner status
-- ================================================================
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_tblStudentInfo_Status' AND object_id = OBJECT_ID('tblStudentInfo'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_tblStudentInfo_Status
    ON tblStudentInfo (Status)
    INCLUDE (FirstName, LastName, StudentID, School, AssignedTo, IsDeleted)
    WITH (ONLINE = ON, FILLFACTOR = 90);

    PRINT 'Created index: IX_tblStudentInfo_Status';
END
ELSE
BEGIN
    PRINT 'Index IX_tblStudentInfo_Status already exists';
END
GO

-- ================================================================
-- 5. Index on LastCommunicateDate for follow-up filtering
-- ================================================================
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_tblStudentInfo_LastCommDate' AND object_id = OBJECT_ID('tblStudentInfo'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_tblStudentInfo_LastCommDate
    ON tblStudentInfo (LastCommunicateDate, Status)
    INCLUDE (FirstName, LastName, StudentID, School, AssignedTo, IsDeleted)
    WITH (ONLINE = ON, FILLFACTOR = 90);

    PRINT 'Created index: IX_tblStudentInfo_LastCommDate';
END
ELSE
BEGIN
    PRINT 'Index IX_tblStudentInfo_LastCommDate already exists';
END
GO

-- ================================================================
-- 6. Index on IsDeleted for filtering out deleted records
-- ================================================================
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_tblStudentInfo_IsDeleted' AND object_id = OBJECT_ID('tblStudentInfo'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_tblStudentInfo_IsDeleted
    ON tblStudentInfo (IsDeleted)
    INCLUDE (FirstName, LastName, StudentID, School, AssignedTo, Status)
    WHERE IsDeleted IS NULL OR IsDeleted = 0
    WITH (ONLINE = ON, FILLFACTOR = 90);

    PRINT 'Created index: IX_tblStudentInfo_IsDeleted (filtered)';
END
ELSE
BEGIN
    PRINT 'Index IX_tblStudentInfo_IsDeleted already exists';
END
GO

-- ================================================================
-- 7. Composite index for common filter combinations
-- ================================================================
-- This index covers the most common query pattern: filtering by
-- status, assignment, and searching by name
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_tblStudentInfo_Composite' AND object_id = OBJECT_ID('tblStudentInfo'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_tblStudentInfo_Composite
    ON tblStudentInfo (IsDeleted, Status, AssignedTo, FirstName, LastName)
    INCLUDE (StudentID, School, Email, Tutor, Gender, DateOfBirth, Ethnicity, Code, LastCommunicateDate)
    WITH (ONLINE = ON, FILLFACTOR = 90);

    PRINT 'Created index: IX_tblStudentInfo_Composite';
END
ELSE
BEGIN
    PRINT 'Index IX_tblStudentInfo_Composite already exists';
END
GO

-- ================================================================
-- 8. Index on Email for "My Students" filtering
-- ================================================================
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_tblStudentInfo_Email' AND object_id = OBJECT_ID('tblStudentInfo'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_tblStudentInfo_Email
    ON tblStudentInfo (Email)
    INCLUDE (FirstName, LastName, StudentID, School, Status, IsDeleted)
    WITH (ONLINE = ON, FILLFACTOR = 90);

    PRINT 'Created index: IX_tblStudentInfo_Email';
END
ELSE
BEGIN
    PRINT 'Index IX_tblStudentInfo_Email already exists';
END
GO

-- ================================================================
-- Update Statistics
-- ================================================================
-- Update statistics to help the query optimizer make better decisions
UPDATE STATISTICS tblStudentInfo WITH FULLSCAN;
PRINT 'Updated statistics for tblStudentInfo';
GO

-- ================================================================
-- Verify Indexes
-- ================================================================
-- Display all indexes on tblStudentInfo table
SELECT
    i.name AS IndexName,
    i.type_desc AS IndexType,
    i.is_unique AS IsUnique,
    i.fill_factor AS FillFactor,
    STUFF((
        SELECT ', ' + c.name
        FROM sys.index_columns ic
        INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
        WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 0
        ORDER BY ic.key_ordinal
        FOR XML PATH('')
    ), 1, 2, '') AS KeyColumns,
    STUFF((
        SELECT ', ' + c.name
        FROM sys.index_columns ic
        INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
        WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 1
        FOR XML PATH('')
    ), 1, 2, '') AS IncludedColumns
FROM sys.indexes i
WHERE i.object_id = OBJECT_ID('tblStudentInfo')
    AND i.type > 0  -- Exclude heap
ORDER BY i.name;

PRINT '========================================';
PRINT 'Index creation completed successfully!';
PRINT '========================================';
GO
