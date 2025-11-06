-- =============================================
-- Remote Registration Notification Email Setup
-- =============================================
-- This script creates the table for storing a single global notification
-- email address for remote learner registrations.
--
-- The system sends ONE comprehensive notification containing all courses
-- from all categories (Work & Life Skills and Farming & Horticulture).
-- =============================================

-- Create table for storing global notification email for remote registrations
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[tblRemoteRegistrationSettings]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[tblRemoteRegistrationSettings] (
        [SettingKey] NVARCHAR(50) PRIMARY KEY,
        [SettingValue] NVARCHAR(500) NULL,
        [Description] NVARCHAR(255) NULL,
        [UpdatedDate] DATETIME DEFAULT GETDATE(),
        [UpdatedBy] NVARCHAR(100) NULL
    );

    -- Insert the notification email setting
    INSERT INTO [dbo].[tblRemoteRegistrationSettings] ([SettingKey], [SettingValue], [Description])
    VALUES ('NotificationEmail', NULL, 'Email address to receive remote registration notifications');

    PRINT 'Table tblRemoteRegistrationSettings created and initialized successfully';
    PRINT 'Please configure the notification email address in: Settings > Remote Registration Categories';
END
ELSE
BEGIN
    PRINT 'Table tblRemoteRegistrationSettings already exists';

    -- Ensure the notification email setting exists
    IF NOT EXISTS (SELECT 1 FROM [dbo].[tblRemoteRegistrationSettings] WHERE [SettingKey] = 'NotificationEmail')
    BEGIN
        INSERT INTO [dbo].[tblRemoteRegistrationSettings] ([SettingKey], [SettingValue], [Description])
        VALUES ('NotificationEmail', NULL, 'Email address to receive remote registration notifications');
        PRINT 'Added missing setting: NotificationEmail';
    END
END
GO

-- Drop old table if it exists (migration from old schema)
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[tblRemoteRegistrationCategorySettings]') AND type in (N'U'))
BEGIN
    -- Migrate data if there was an email configured in the old table
    DECLARE @OldEmail NVARCHAR(255);

    SELECT TOP 1 @OldEmail = [NotificationEmail]
    FROM [dbo].[tblRemoteRegistrationCategorySettings]
    WHERE [NotificationEmail] IS NOT NULL;

    IF @OldEmail IS NOT NULL
    BEGIN
        UPDATE [dbo].[tblRemoteRegistrationSettings]
        SET [SettingValue] = @OldEmail
        WHERE [SettingKey] = 'NotificationEmail';

        PRINT 'Migrated notification email from old table: ' + @OldEmail;
    END

    DROP TABLE [dbo].[tblRemoteRegistrationCategorySettings];
    PRINT 'Old table tblRemoteRegistrationCategorySettings has been removed';
END
GO

-- Display current configuration
SELECT
    [SettingKey],
    ISNULL([SettingValue], 'Not Configured') AS [SettingValue],
    [Description],
    [UpdatedDate],
    [UpdatedBy]
FROM [dbo].[tblRemoteRegistrationSettings]
WHERE [SettingKey] = 'NotificationEmail';
GO
