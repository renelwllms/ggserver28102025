-- =============================================
-- Create Notification Settings Table
-- =============================================
-- Simple script to create the notification table
-- Safe to run multiple times
-- =============================================

-- Create the new notification settings table if it doesn't exist
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[tblRemoteRegistrationSettings]') AND type in (N'U'))
BEGIN
    PRINT 'Creating table tblRemoteRegistrationSettings...';

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

    PRINT 'Table created successfully!';
END
ELSE
BEGIN
    PRINT 'Table tblRemoteRegistrationSettings already exists.';
END
GO

-- Migrate data from old table if it exists
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[tblRemoteRegistrationCategorySettings]') AND type in (N'U'))
BEGIN
    PRINT 'Found old table, migrating data...';

    -- Get existing email from old table
    DECLARE @ExistingEmail NVARCHAR(255);

    SELECT TOP 1 @ExistingEmail = [NotificationEmail]
    FROM [dbo].[tblRemoteRegistrationCategorySettings]
    WHERE [NotificationEmail] IS NOT NULL;

    -- Update new table with migrated email
    IF @ExistingEmail IS NOT NULL
    BEGIN
        UPDATE [dbo].[tblRemoteRegistrationSettings]
        SET [SettingValue] = @ExistingEmail
        WHERE [SettingKey] = 'NotificationEmail';

        PRINT 'Migrated email: ' + @ExistingEmail;
    END

    -- Drop the old table
    DROP TABLE [dbo].[tblRemoteRegistrationCategorySettings];
    PRINT 'Old table removed.';
END
ELSE
BEGIN
    PRINT 'No old table to migrate.';
END
GO

-- Display the current configuration
PRINT '';
PRINT 'Current notification settings:';
SELECT
    [SettingKey],
    ISNULL([SettingValue], 'Not configured') AS [SettingValue],
    [Description]
FROM [dbo].[tblRemoteRegistrationSettings]
WHERE [SettingKey] = 'NotificationEmail';
GO

PRINT '';
PRINT 'Done! Table is ready to use.';
GO
