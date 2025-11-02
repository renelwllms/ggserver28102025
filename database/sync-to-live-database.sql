-- ================================================================
-- LIVE DATABASE SYNC SCRIPT
-- Generated: 2025-11-02
-- Target Database: ggdbmain01 on 114.23.127.1
-- ================================================================
-- This script consolidates all local development database changes
-- that need to be applied to the live production database.
--
-- IMPORTANT: Review this script before executing!
-- Backup your database before applying changes.
-- ================================================================

USE [ggdbmain01];
GO

PRINT '========================================';
PRINT 'Starting database synchronization...';
PRINT '========================================';
GO

-- ================================================================
-- SECTION 1: ADD MICROCREDENTIAL FIELDS
-- ================================================================
-- Add GroupName and NotificationEmail columns to tblMicroCredentialEligibility

PRINT '';
PRINT 'Section 1: Adding MicroCredential fields...';
GO

-- Check and add GroupName column
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('tblMicroCredentialEligibility')
    AND name = 'GroupName'
)
BEGIN
    ALTER TABLE tblMicroCredentialEligibility
    ADD GroupName NVARCHAR(255) NULL;

    PRINT '✓ GroupName column added successfully';
END
ELSE
BEGIN
    PRINT '- GroupName column already exists';
END
GO

-- Check and add NotificationEmail column
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('tblMicroCredentialEligibility')
    AND name = 'NotificationEmail'
)
BEGIN
    ALTER TABLE tblMicroCredentialEligibility
    ADD NotificationEmail NVARCHAR(255) NULL;

    PRINT '✓ NotificationEmail column added successfully';
END
ELSE
BEGIN
    PRINT '- NotificationEmail column already exists';
END
GO

-- Set default group names for existing groups if GroupName is NULL
UPDATE tblMicroCredentialEligibility
SET GroupName = 'Microcredential Group ' + CAST(GroupId AS NVARCHAR)
WHERE GroupName IS NULL;

-- Set default notification email for existing groups if NotificationEmail is NULL
UPDATE tblMicroCredentialEligibility
SET NotificationEmail = 'jorgia@thegetgroup.co.nz'
WHERE NotificationEmail IS NULL;

PRINT '✓ Default values set for existing records';
GO

-- ================================================================
-- SECTION 2: ADD CATEGORY COLUMNS
-- ================================================================
-- Add CourseCategory and USCategory columns for Remote Registration

PRINT '';
PRINT 'Section 2: Adding Category columns...';
GO

-- Add CourseCategory column to tblCourse
IF NOT EXISTS (
    SELECT * FROM sys.columns
    WHERE object_id = OBJECT_ID(N'[dbo].[tblCourse]')
    AND name = 'CourseCategory'
)
BEGIN
    ALTER TABLE [dbo].[tblCourse]
    ADD CourseCategory VARCHAR(100) NULL;

    PRINT '✓ CourseCategory column added to tblCourse';
END
ELSE
BEGIN
    PRINT '- CourseCategory column already exists in tblCourse';
END
GO

-- Add USCategory column to tblUnitStandard
IF NOT EXISTS (
    SELECT * FROM sys.columns
    WHERE object_id = OBJECT_ID(N'[dbo].[tblUnitStandard]')
    AND name = 'USCategory'
)
BEGIN
    ALTER TABLE [dbo].[tblUnitStandard]
    ADD USCategory VARCHAR(100) NULL;

    PRINT '✓ USCategory column added to tblUnitStandard';
END
ELSE
BEGIN
    PRINT '- USCategory column already exists in tblUnitStandard';
END
GO

-- Add index for CourseCategory
IF NOT EXISTS (
    SELECT * FROM sys.indexes
    WHERE name = 'IX_tblCourse_CourseCategory'
    AND object_id = OBJECT_ID(N'[dbo].[tblCourse]')
)
BEGIN
    CREATE INDEX IX_tblCourse_CourseCategory
    ON [dbo].[tblCourse](CourseCategory)
    WHERE CourseCategory IS NOT NULL;

    PRINT '✓ Index IX_tblCourse_CourseCategory added';
END
ELSE
BEGIN
    PRINT '- Index IX_tblCourse_CourseCategory already exists';
END
GO

-- Add index for USCategory
IF NOT EXISTS (
    SELECT * FROM sys.indexes
    WHERE name = 'IX_tblUnitStandard_USCategory'
    AND object_id = OBJECT_ID(N'[dbo].[tblUnitStandard]')
)
BEGIN
    CREATE INDEX IX_tblUnitStandard_USCategory
    ON [dbo].[tblUnitStandard](USCategory)
    WHERE USCategory IS NOT NULL;

    PRINT '✓ Index IX_tblUnitStandard_USCategory added';
END
ELSE
BEGIN
    PRINT '- Index IX_tblUnitStandard_USCategory already exists';
END
GO

-- ================================================================
-- SECTION 3: ADD PERFORMANCE INDEXES
-- ================================================================
-- Add indexes to tblStudentInfo to improve query performance

PRINT '';
PRINT 'Section 3: Adding Performance Indexes...';
GO

-- Index 1: Names (FirstName, LastName)
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_tblStudentInfo_Names' AND object_id = OBJECT_ID('tblStudentInfo'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_tblStudentInfo_Names
    ON tblStudentInfo (FirstName, LastName)
    INCLUDE (StudentID, School, AssignedTo, Status, Email, Tutor, Gender, DateOfBirth, Ethnicity, Code, IsDeleted)
    WITH (FILLFACTOR = 90);

    PRINT '✓ Index IX_tblStudentInfo_Names created';
END
ELSE
BEGIN
    PRINT '- Index IX_tblStudentInfo_Names already exists';
END
GO

-- Index 2: School
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_tblStudentInfo_School' AND object_id = OBJECT_ID('tblStudentInfo'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_tblStudentInfo_School
    ON tblStudentInfo (School)
    INCLUDE (FirstName, LastName, StudentID, AssignedTo, Status, IsDeleted)
    WITH (FILLFACTOR = 90);

    PRINT '✓ Index IX_tblStudentInfo_School created';
END
ELSE
BEGIN
    PRINT '- Index IX_tblStudentInfo_School already exists';
END
GO

-- Index 3: AssignedTo
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_tblStudentInfo_AssignedTo' AND object_id = OBJECT_ID('tblStudentInfo'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_tblStudentInfo_AssignedTo
    ON tblStudentInfo (AssignedTo)
    INCLUDE (FirstName, LastName, StudentID, School, Status, IsDeleted)
    WITH (FILLFACTOR = 90);

    PRINT '✓ Index IX_tblStudentInfo_AssignedTo created';
END
ELSE
BEGIN
    PRINT '- Index IX_tblStudentInfo_AssignedTo already exists';
END
GO

-- Index 4: Status
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_tblStudentInfo_Status' AND object_id = OBJECT_ID('tblStudentInfo'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_tblStudentInfo_Status
    ON tblStudentInfo (Status)
    INCLUDE (FirstName, LastName, StudentID, School, AssignedTo, IsDeleted)
    WITH (FILLFACTOR = 90);

    PRINT '✓ Index IX_tblStudentInfo_Status created';
END
ELSE
BEGIN
    PRINT '- Index IX_tblStudentInfo_Status already exists';
END
GO

-- Index 5: LastCommunicateDate
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_tblStudentInfo_LastCommDate' AND object_id = OBJECT_ID('tblStudentInfo'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_tblStudentInfo_LastCommDate
    ON tblStudentInfo (LastCommunicateDate, Status)
    INCLUDE (FirstName, LastName, StudentID, School, AssignedTo, IsDeleted)
    WITH (FILLFACTOR = 90);

    PRINT '✓ Index IX_tblStudentInfo_LastCommDate created';
END
ELSE
BEGIN
    PRINT '- Index IX_tblStudentInfo_LastCommDate already exists';
END
GO

-- Index 6: IsDeleted (filtered)
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_tblStudentInfo_IsDeleted' AND object_id = OBJECT_ID('tblStudentInfo'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_tblStudentInfo_IsDeleted
    ON tblStudentInfo (IsDeleted)
    INCLUDE (FirstName, LastName, StudentID, School, AssignedTo, Status)
    WHERE IsDeleted IS NULL OR IsDeleted = 0
    WITH (FILLFACTOR = 90);

    PRINT '✓ Index IX_tblStudentInfo_IsDeleted created';
END
ELSE
BEGIN
    PRINT '- Index IX_tblStudentInfo_IsDeleted already exists';
END
GO

-- Index 7: Composite Index
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_tblStudentInfo_Composite' AND object_id = OBJECT_ID('tblStudentInfo'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_tblStudentInfo_Composite
    ON tblStudentInfo (IsDeleted, Status, AssignedTo, FirstName, LastName)
    INCLUDE (StudentID, School, Email, Tutor, Gender, DateOfBirth, Ethnicity, Code, LastCommunicateDate)
    WITH (FILLFACTOR = 90);

    PRINT '✓ Index IX_tblStudentInfo_Composite created';
END
ELSE
BEGIN
    PRINT '- Index IX_tblStudentInfo_Composite already exists';
END
GO

-- Index 8: Email
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_tblStudentInfo_Email' AND object_id = OBJECT_ID('tblStudentInfo'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_tblStudentInfo_Email
    ON tblStudentInfo (Email)
    INCLUDE (FirstName, LastName, StudentID, School, Status, IsDeleted)
    WITH (FILLFACTOR = 90);

    PRINT '✓ Index IX_tblStudentInfo_Email created';
END
ELSE
BEGIN
    PRINT '- Index IX_tblStudentInfo_Email already exists';
END
GO

-- ================================================================
-- SECTION 4: UPDATE STATISTICS
-- ================================================================

PRINT '';
PRINT 'Section 4: Updating statistics...';
GO

UPDATE STATISTICS tblStudentInfo WITH FULLSCAN;
PRINT '✓ Statistics updated for tblStudentInfo';
GO

UPDATE STATISTICS tblMicroCredentialEligibility WITH FULLSCAN;
PRINT '✓ Statistics updated for tblMicroCredentialEligibility';
GO

UPDATE STATISTICS tblCourse WITH FULLSCAN;
PRINT '✓ Statistics updated for tblCourse';
GO

UPDATE STATISTICS tblUnitStandard WITH FULLSCAN;
PRINT '✓ Statistics updated for tblUnitStandard';
GO

-- ================================================================
-- SECTION 5: VERIFICATION
-- ================================================================

PRINT '';
PRINT '========================================';
PRINT 'Verification Report:';
PRINT '========================================';
GO

-- Verify columns exist
SELECT
    'tblMicroCredentialEligibility' AS TableName,
    CASE WHEN COL_LENGTH('tblMicroCredentialEligibility', 'GroupName') IS NOT NULL THEN 'YES' ELSE 'NO' END AS HasGroupName,
    CASE WHEN COL_LENGTH('tblMicroCredentialEligibility', 'NotificationEmail') IS NOT NULL THEN 'YES' ELSE 'NO' END AS HasNotificationEmail;

SELECT
    'tblCourse' AS TableName,
    CASE WHEN COL_LENGTH('tblCourse', 'CourseCategory') IS NOT NULL THEN 'YES' ELSE 'NO' END AS HasCourseCategory;

SELECT
    'tblUnitStandard' AS TableName,
    CASE WHEN COL_LENGTH('tblUnitStandard', 'USCategory') IS NOT NULL THEN 'YES' ELSE 'NO' END AS HasUSCategory;
GO

-- Count indexes on tblStudentInfo
SELECT
    'tblStudentInfo' AS TableName,
    COUNT(*) AS TotalIndexes
FROM sys.indexes i
WHERE i.object_id = OBJECT_ID('tblStudentInfo')
    AND i.type > 0;  -- Exclude heap
GO

PRINT '';
PRINT '========================================';
PRINT 'Database synchronization completed!';
PRINT '========================================';
PRINT '';
PRINT 'Next Steps:';
PRINT '1. Verify all changes using the verification report above';
PRINT '2. Test the application thoroughly';
PRINT '3. Go to Settings > Courses > Remote Registration Categories';
PRINT '4. Assign categories to courses and unit standards';
PRINT '';
GO
