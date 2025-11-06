-- =============================================
-- Remote Registration Notification Email Setup
-- =============================================
-- This script creates the table for storing notification email settings
-- for remote learner registrations.
--
-- Note: Both categories ('Work & Life Skills' and 'Farming & Horticulture')
-- should be configured with the SAME email address, as the system sends
-- ONE comprehensive notification containing all courses from both pathways.
-- =============================================

-- Create table for storing notification emails for remote registration categories
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[tblRemoteRegistrationCategorySettings]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[tblRemoteRegistrationCategorySettings] (
        [CategoryName] NVARCHAR(100) PRIMARY KEY,
        [NotificationEmail] NVARCHAR(255) NULL
    );

    -- Insert default rows for the two categories
    -- Note: Configure both with the same email address in the admin UI
    INSERT INTO [dbo].[tblRemoteRegistrationCategorySettings] ([CategoryName], [NotificationEmail])
    VALUES
        ('Work & Life Skills', NULL),
        ('Farming & Horticulture', NULL);

    PRINT 'Table tblRemoteRegistrationCategorySettings created and initialized successfully';
    PRINT 'Please configure the notification email address in: Settings > Remote Registration Categories';
END
ELSE
BEGIN
    PRINT 'Table tblRemoteRegistrationCategorySettings already exists';

    -- Ensure both category rows exist
    IF NOT EXISTS (SELECT 1 FROM [dbo].[tblRemoteRegistrationCategorySettings] WHERE [CategoryName] = 'Work & Life Skills')
    BEGIN
        INSERT INTO [dbo].[tblRemoteRegistrationCategorySettings] ([CategoryName], [NotificationEmail])
        VALUES ('Work & Life Skills', NULL);
        PRINT 'Added missing category: Work & Life Skills';
    END

    IF NOT EXISTS (SELECT 1 FROM [dbo].[tblRemoteRegistrationCategorySettings] WHERE [CategoryName] = 'Farming & Horticulture')
    BEGIN
        INSERT INTO [dbo].[tblRemoteRegistrationCategorySettings] ([CategoryName], [NotificationEmail])
        VALUES ('Farming & Horticulture', NULL);
        PRINT 'Added missing category: Farming & Horticulture';
    END

    -- Remove unused audit columns if they exist (from previous version)
    IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[tblRemoteRegistrationCategorySettings]') AND name = 'CreatedDate')
    BEGIN
        ALTER TABLE [dbo].[tblRemoteRegistrationCategorySettings] DROP COLUMN [CreatedDate];
        PRINT 'Removed unused column: CreatedDate';
    END

    IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[tblRemoteRegistrationCategorySettings]') AND name = 'UpdatedDate')
    BEGIN
        ALTER TABLE [dbo].[tblRemoteRegistrationCategorySettings] DROP COLUMN [UpdatedDate];
        PRINT 'Removed unused column: UpdatedDate';
    END

    IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[tblRemoteRegistrationCategorySettings]') AND name = 'UpdatedBy')
    BEGIN
        ALTER TABLE [dbo].[tblRemoteRegistrationCategorySettings] DROP COLUMN [UpdatedBy];
        PRINT 'Removed unused column: UpdatedBy';
    END
END
GO

-- Display current configuration
SELECT
    [CategoryName],
    ISNULL([NotificationEmail], 'Not Configured') AS [NotificationEmail]
FROM [dbo].[tblRemoteRegistrationCategorySettings]
ORDER BY [CategoryName];
GO
