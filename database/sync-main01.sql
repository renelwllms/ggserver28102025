-- ================================================================
-- Sync main01 Database to Match ggdbmain01
-- ================================================================
-- This script adds the missing columns found in ggdbmain01
-- to bring main01 up to date with the latest schema
-- ================================================================

USE [main01];
GO

PRINT '========================================';
PRINT 'Syncing main01 to match ggdbmain01...';
PRINT '========================================';
GO

-- ================================================================
-- 1. Add Category column to tblCommunicationTemplates
-- ================================================================
PRINT '';
PRINT 'Adding Category to tblCommunicationTemplates...';

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('tblCommunicationTemplates')
    AND name = 'Category'
)
BEGIN
    ALTER TABLE tblCommunicationTemplates
    ADD Category VARCHAR(50) NULL;

    PRINT '✓ Category column added successfully';
END
ELSE
BEGIN
    PRINT '- Category column already exists';
END
GO

-- ================================================================
-- 2. Add CourseCategory column to tblCourse
-- ================================================================
PRINT '';
PRINT 'Adding CourseCategory to tblCourse...';

IF NOT EXISTS (
    SELECT * FROM sys.columns
    WHERE object_id = OBJECT_ID(N'[dbo].[tblCourse]')
    AND name = 'CourseCategory'
)
BEGIN
    ALTER TABLE [dbo].[tblCourse]
    ADD CourseCategory VARCHAR(100) NULL;

    PRINT '✓ CourseCategory column added successfully';
END
ELSE
BEGIN
    PRINT '- CourseCategory column already exists';
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

-- ================================================================
-- 3. Add GroupName and NotificationEmail to tblMicroCredentialEligibility
-- ================================================================
PRINT '';
PRINT 'Adding columns to tblMicroCredentialEligibility...';

-- Add GroupName column
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

-- Add NotificationEmail column
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

-- Set default values for existing records
UPDATE tblMicroCredentialEligibility
SET GroupName = 'Microcredential Group ' + CAST(GroupId AS NVARCHAR)
WHERE GroupName IS NULL;

UPDATE tblMicroCredentialEligibility
SET NotificationEmail = 'jorgia@thegetgroup.co.nz'
WHERE NotificationEmail IS NULL;

PRINT '✓ Default values set for existing records';
GO

-- ================================================================
-- 4. Add USCategory column to tblUnitStandard
-- ================================================================
PRINT '';
PRINT 'Adding USCategory to tblUnitStandard...';

IF NOT EXISTS (
    SELECT * FROM sys.columns
    WHERE object_id = OBJECT_ID(N'[dbo].[tblUnitStandard]')
    AND name = 'USCategory'
)
BEGIN
    ALTER TABLE [dbo].[tblUnitStandard]
    ADD USCategory VARCHAR(100) NULL;

    PRINT '✓ USCategory column added successfully';
END
ELSE
BEGIN
    PRINT '- USCategory column already exists';
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
-- 5. Verification
-- ================================================================
PRINT '';
PRINT '========================================';
PRINT 'Verification:';
PRINT '========================================';

SELECT
    'tblCommunicationTemplates' AS TableName,
    CASE WHEN COL_LENGTH('tblCommunicationTemplates', 'Category') IS NOT NULL THEN 'YES' ELSE 'NO' END AS HasCategory;

SELECT
    'tblCourse' AS TableName,
    CASE WHEN COL_LENGTH('tblCourse', 'CourseCategory') IS NOT NULL THEN 'YES' ELSE 'NO' END AS HasCourseCategory;

SELECT
    'tblMicroCredentialEligibility' AS TableName,
    CASE WHEN COL_LENGTH('tblMicroCredentialEligibility', 'GroupName') IS NOT NULL THEN 'YES' ELSE 'NO' END AS HasGroupName,
    CASE WHEN COL_LENGTH('tblMicroCredentialEligibility', 'NotificationEmail') IS NOT NULL THEN 'YES' ELSE 'NO' END AS HasNotificationEmail;

SELECT
    'tblUnitStandard' AS TableName,
    CASE WHEN COL_LENGTH('tblUnitStandard', 'USCategory') IS NOT NULL THEN 'YES' ELSE 'NO' END AS HasUSCategory;
GO

PRINT '';
PRINT '========================================';
PRINT '✓ main01 sync completed successfully!';
PRINT '========================================';
GO
