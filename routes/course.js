const express = require("express");
const router = express.Router();
const isAuthenticated = require("./auth");
const { getPool } = require("./utils");
const sql = require("mssql");

router.get("/list", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();

    let query = `
      SELECT c.*,
        (SELECT STRING_AGG(CAST(ucs.UnitStandardID AS VARCHAR), ',')
         FROM tblCourseUnitStandard ucs
         WHERE ucs.CourseID = c.CourseID) AS UnitStandardIDs,
        (SELECT COUNT(*)
         FROM tblStudentInCourse sic
         WHERE sic.CourseID = c.CourseID) AS StudentCount,
        (SELECT COUNT(*)
         FROM tblMicroCredentialEligibility mce
         WHERE mce.CourseId = c.CourseID) AS InMicrocredentialCount
      FROM tblCourse c
      WHERE IsDeleted=0`;

    const CourseName = req.query.CourseName;
    const CourseLevel = Number(req.query.CourseLevel);
    const CourseCredits = Number(req.query.CourseCredits);

    if (CourseName) {
      request.input("CourseName", sql.VarChar, CourseName);
      query += ` AND [CourseName] LIKE '%' + @CourseName + '%'`;
    }
    if (CourseLevel) {
      request.input("CourseLevel", sql.Int, CourseLevel);
      query += ` AND CourseLevel = @CourseLevel`;
    }
    if (CourseCredits) {
      request.input("CourseCredits", sql.Int, CourseCredits);
      query += ` AND CourseCredits = @CourseCredits`;
    }

    request.query(query, (err, result) => {
      if (err) {
        return res.send({ code: 0, data: [], message: "Error occurred" });
      }

      if (result?.recordset) {
        const data = result.recordset.map((course) => ({
          ...course,
          UnitStandardIDs: course.UnitStandardIDs
            ? course.UnitStandardIDs.split(",").map((id) => parseInt(id))
            : [],
        }));

        return res.send({
          code: 0,
          data: data,
        });
      }

      return res.send({ code: 0, data: [] });
    });
  } catch (error) {
    next(error);
  }
});

router.get("/unit", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();
    const id = Number(req.query.id);

    if (!id) {
      return res.send({ code: 0, data: [] });
    }
    request.input("id", sql.Int, id);
    const query = `
    WITH cus AS (
        SELECT * FROM tblCourseUnitStandard WHERE CourseID = @id
    )
    SELECT us.USName,us.UnitStandardID FROM  cus LEFT OUTER JOIN tblUnitStandard us ON cus.UnitStandardID = us.UnitStandardID`;

    request.query(query, (err, result) => {
      if (err) console.log(err);
      if (result?.recordset) {
        const d = result.recordsets[0];

        return res.send({
          code: 0,
          data: d,
        });
      }
      return res.send({ code: 0, data: [] });
    });
  } catch (error) {
    next(error);
  }
});

router.get("/units", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();

    let query = `SELECT * FROM tblUnitStandard WHERE IsDeleted = 0 `;

    const name = req.query.name;
    const USLevel = Number(req.query.USLevel);
    const USCredits = Number(req.query.USCredits);

    if (name) {
      request.input("name", sql.VarChar, name);
      query += `AND ([USName] LIKE '%' + @name + '%' OR [US] LIKE '%' + @name + '%')`;
    }

    if (USLevel) {
      request.input("USLevel", sql.Int, USLevel);
      query += ` AND USLevel = @USLevel`;
    }
    if (USCredits) {
      request.input("USCredits", sql.Int, USCredits);
      query += ` AND USCredits = @USCredits`;
    }

    request.query(query, (err, result) => {
      if (err) console.log(err);
      if (result?.recordset) {
        const d = result.recordsets[0];

        return res.send({
          code: 0,
          data: d,
        });
      }
      return res.send({ code: 0, data: [] });
    });
  } catch (error) {
    next(error);
  }
});

router.post("/", isAuthenticated, async (req, res, next) => {
  const {
    CourseName,
    CourseDetails,
    CourseLevel,
    CourseCredits,
    CourseDelivery,
    CourseGroup,
    UnitStandardIDs,
    IsCustom,
  } = req.body;
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();

    const request = new sql.Request(transaction);

    // Insert into tblCourse
    let courseQuery = `
      INSERT INTO tblCourse (CourseName, CourseDetails, CourseLevel, CourseCredits, CourseDelivery, CourseGroup, CreateDate, CreateUser, UpdateDate, UpdateUser, IsCustom)
      VALUES (@CourseName, @CourseDetails, @CourseLevel, @CourseCredits, @CourseDelivery, @CourseGroup, GETDATE(), @CreateUser, GETDATE(), @CreateUser, @IsCustom)
      SELECT @@IDENTITY AS CourseID
      ;
    `;
    request.input("CourseName", sql.VarChar, CourseName);
    request.input("CourseDetails", sql.Text, CourseDetails);
    request.input("CourseLevel", sql.Int, CourseLevel);
    request.input("CourseCredits", sql.Int, CourseCredits);
    request.input("CourseDelivery", sql.VarChar, CourseDelivery);
    request.input("CourseGroup", sql.VarChar, CourseGroup);
    request.input("CreateUser", sql.VarChar, req?.info?.displayName);
    request.input("IsCustom", sql.Bit, IsCustom);

    const courseIdResult =  await request.query(courseQuery);
    const CourseID = courseIdResult.recordset[0].CourseID;

    // Insert into tblCourseUnitStandard
    if (UnitStandardIDs && UnitStandardIDs.length > 0) {
      request.input("CourseID", sql.Int, CourseID);
      console.log("CourseID");
      console.log(CourseID);
      console.log("UnitStandardIDs")
      console.log(UnitStandardIDs);
      let insertUnitsQuery = `
        INSERT INTO tblCourseUnitStandard (CourseID, UnitStandardID) 
        VALUES 
        ${UnitStandardIDs.map(
          (_, idx) => `(@CourseID, @UnitStandardID${idx})`
        ).join(", ")};
      `;
      UnitStandardIDs.forEach((UnitStandardID, idx) => {
        request.input(`UnitStandardID${idx}`, sql.Int, UnitStandardID);
      });

      await request.query(insertUnitsQuery);
    }
    
    await transaction.commit();
    res.send({ code: 0, data: true, message: "Course created successfully" });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
});

router.put("/", isAuthenticated, async (req, res, next) => {
  const {
    CourseID,
    CourseName,
    CourseDetails,
    CourseLevel,
    CourseCredits,
    CourseDelivery,
    CourseGroup,
    UnitStandardIDs,
    IsCustom
  } = req.body;
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();

    const request = new sql.Request(transaction);

    // Update tblCourse
    let updateCourseQuery = `
      UPDATE tblCourse
      SET CourseName = @CourseName, CourseDetails = @CourseDetails, CourseLevel = @CourseLevel,
          CourseCredits = @CourseCredits, CourseDelivery = @CourseDelivery, CourseGroup = @CourseGroup,
          UpdateDate = GETDATE(), UpdateUser = @UpdateUser, IsCustom = @IsCustom
      WHERE CourseID = @CourseID;
    `;
    request.input("CourseID", sql.Int, CourseID);
    request.input("CourseName", sql.VarChar, CourseName);
    request.input("CourseDetails", sql.Text, CourseDetails);
    request.input("CourseLevel", sql.Int, CourseLevel);
    request.input("CourseCredits", sql.Int, CourseCredits);
    request.input("CourseDelivery", sql.VarChar, CourseDelivery);
    request.input("CourseGroup", sql.VarChar, CourseGroup);
    request.input("UpdateUser", sql.VarChar, req?.info?.displayName);
    request.input("IsCustom", sql.Bit, IsCustom);
    await request.query(updateCourseQuery);

    // Delete existing Unit Standards
    let deleteUnitsQuery = `DELETE FROM tblCourseUnitStandard WHERE CourseID = @CourseID;`;
    await request.query(deleteUnitsQuery);

    // Insert new Unit Standards
    if (UnitStandardIDs && UnitStandardIDs.length > 0) {
      let insertUnitsQuery = `
        INSERT INTO tblCourseUnitStandard (CourseID, UnitStandardID) 
        VALUES 
        ${UnitStandardIDs.map(
          (_, idx) => `(@CourseID, @UnitStandardID${idx})`
        ).join(", ")};
      `;
      UnitStandardIDs.forEach((UnitStandardID, idx) => {
        request.input(`UnitStandardID${idx}`, sql.Int, UnitStandardID);
      });

      await request.query(insertUnitsQuery);
    }

    await transaction.commit();
    res.send({ code: 0, data: "true", message: "Course updated successfully" });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
});

router.delete("/", isAuthenticated, async (req, res, next) => {
  const { id } = req.body;
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();

    const request = new sql.Request(transaction);
    
    request.input("CourseID", sql.Int, id);
    // Delete from tblCourse
    let deleteCourseQuery = `UPDATE tblCourse SET IsDeleted = 1 WHERE CourseID = @CourseID;`;
    await request.query(deleteCourseQuery);

    await transaction.commit();
    res.send({ code: 0, data: "true", message: "Course deleted successfully" });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
});

router.post("/unitstandard", isAuthenticated, async (req, res, next) => {
  const {
    UnitStandardID,
    US,
    USName,
    USLevel,
    USCredits,
    USDescription,
    USClassification,
    USURL,
    USVersion,
  } = req.body;

  try {
    const pool = await getPool();
    const request = pool.request();
    let unitStandardQuery = "";
    if (UnitStandardID) {
      // Update existing Unit Standard
      unitStandardQuery = `
        UPDATE tblUnitStandard
        SET US = @US, USName = @USName, USLevel = @USLevel, USVersion = @USVersion, USCredits = @USCredits, USDescription = @USDescription,
            USClassification = @USClassification, USURL = @USURL,
            UpdateDate = GETDATE(), UpdateUser = @CreateUser
        WHERE UnitStandardID = @UnitStandardID;
      `;
      request.input("UnitStandardID", sql.Int, UnitStandardID);
    } else {
      // Insert new Unit Standard
      unitStandardQuery = `
        INSERT INTO tblUnitStandard (US, USName, USLevel, USCredits, USDescription, USClassification, USURL, USVersion, CreateDate, CreateUser, UpdateDate, UpdateUser)
        VALUES (@US, @USName, @USLevel, @USCredits, @USDescription, @USClassification, @USURL, @USVersion, GETDATE(), @CreateUser, GETDATE(), @CreateUser);
      `;
    }

    request.input("US", sql.VarChar, US);
    request.input("USName", sql.VarChar, USName);
    request.input("USLevel", sql.Int, USLevel);
    request.input("USCredits", sql.Int, USCredits);
    request.input("USDescription", sql.Text, USDescription);
    request.input("USClassification", sql.VarChar, USClassification);
    request.input("USURL", sql.VarChar, USURL);
    request.input("USVersion", sql.Int, USVersion);
    request.input("CreateUser", sql.VarChar, req?.info?.displayName);

    await request.query(unitStandardQuery);
    res.send({
      code: 0,
      data: true,
      message: UnitStandardID
        ? "Unit Standard updated successfully"
        : "Unit Standard created successfully",
    });
  } catch (error) {
    next(error);
  }
});

router.post("/addSchool", isAuthenticated, async (req, res, next) => {
  const {
    SchoolNumber,
    SchoolName, 
    Telephone, 
    Fax, 
    Email, 
    SchoolWebsite, 
    Street, 
    Suburb, 
    DHB,
    City, 
    PostalAddress1, 
    PostalAddress2, 
    PostalAddress3, 
    PostalCode, 
    SchooolNotes, 
    UrbanArea, 
    SchoolType,
  } = req.body;
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();

    const request = new sql.Request(transaction);

    // Insert into tblSchoolWorkplace
    let schoolQuery = `
    INSERT INTO [dbo].[tblSchoolWorkplace]
           (SchoolNumber, SchoolName, Telephone, Fax, Email, SchoolWebsite, Street, Suburb, DHB ,City, PostalAddress1, PostalAddress2, PostalAddress3, PostalCode, SchooolNotes, UrbanArea, SchoolType, CreateDate, CreateUser, UpdateDate, UpdateUser)
     VALUES
           ((SELECT ISNULL(MAX(SchoolNumber),0) + 1   FROM tblSchoolWorkplace WHERE 1=1), @SchoolName, @Telephone, @Fax, @Email, @SchoolWebsite, @Street, @Suburb, @DHB, @City, @PostalAddress1, @PostalAddress2, @PostalAddress3, @PostalCode, @SchooolNotes, @UrbanArea, @SchoolType, GETDATE(), NULL, GETDATE(), NULL)
    `;
    request.input("SchoolName", sql.VarChar, SchoolName);
    request.input("Telephone", sql.VarChar, Telephone);
    request.input("Fax", sql.VarChar, Fax);
    request.input("Email", sql.VarChar, Email);
    request.input("SchoolWebsite", sql.VarChar, SchoolWebsite);
    request.input("Street", sql.VarChar, Street);
    request.input("Suburb", sql.VarChar, Suburb);
    request.input("DHB", sql.VarChar, DHB);
    request.input("City", sql.VarChar, City);
    request.input("PostalAddress1", sql.VarChar, PostalAddress1);
    request.input("PostalAddress2", sql.VarChar, PostalAddress2);
    request.input("PostalAddress3", sql.VarChar, PostalAddress3);
    request.input("PostalCode", sql.VarChar, PostalCode);
    request.input("SchooolNotes", sql.VarChar, SchooolNotes);
    request.input("UrbanArea", sql.VarChar, UrbanArea);
    request.input("SchoolType", sql.VarChar, SchoolType);

    if (SchoolNumber && SchoolNumber > 0) {
      request.input("SchoolNumber", sql.Int, SchoolNumber);
      schoolQuery = `UPDATE [dbo].[tblSchoolWorkplace]
                  SET SchoolName = @SchoolName, Telephone = @Telephone, Fax = @Fax, Email = @Email, SchoolWebsite = @SchoolWebsite,
                  Street = @Street, Suburb = @Suburb, DHB = @DHB, City = @City, PostalAddress1 = @PostalAddress1, PostalAddress2 = @PostalAddress2,
                  PostalAddress3 = @PostalAddress3, PostalCode = @PostalCode, SchooolNotes = @SchooolNotes, UrbanArea = @UrbanArea, SchoolType = @SchoolType
                WHERE [SchoolNumber] = @SchoolNumber`;
      await request.query(schoolQuery);
      await transaction.commit();
      res.send({ code: 0, data: true, message: "School edit successfully" });
    }
    else{      ;
      await request.query(schoolQuery);
      await transaction.commit();
      res.send({ code: 0, data: true, message: "School created successfully" });
    }
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
});


router.post("/deleteSchool", isAuthenticated, async (req, res, next) => {
  const {id} = req.body;
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();

    const request = new sql.Request(transaction);

    if (id) {
      request.input("SchoolNumber", sql.Int, id);
      schoolQuery = `UPDATE [dbo].[tblSchoolWorkplace] SET IsDeleted = 1 WHERE [SchoolNumber] = @SchoolNumber`;
      await request.query(schoolQuery);
      await transaction.commit();
      res.send({ code: 0, data: true, message: "School delete successfully" });
    } 
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
});


router.post("/deleteUnitStandard", isAuthenticated, async (req, res, next) => {
  const {id} = req.body;
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();

    const request = new sql.Request(transaction);

    if (id) {
      request.input("UnitStandardID", sql.Int, id);
      schoolQuery = `UPDATE [dbo].[tblUnitStandard] SET IsDeleted = 1 WHERE [UnitStandardID] = @UnitStandardID`;
      await request.query(schoolQuery);
      await transaction.commit();
      res.send({ code: 0, data: true, message: "UnitStandard delete successfully" });
    }
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
});

// Public endpoint for getting courses for remote registration form
router.get("/publicCourseList", async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();
    const category = req.query.category; // "Work & Life Skills" or "Farming & Horticulture"

    let query = `
      SELECT CourseID, CourseName, CourseDetails, CourseCredits, IsCustom
      FROM tblCourse
      WHERE (IsDeleted IS NULL OR IsDeleted = 0)
    `;

    // Filter by category if provided
    if (category) {
      request.input("category", sql.VarChar, category);
      query += ` AND CourseCategory = @category`;
    }

    query += ` ORDER BY CourseName`;

    const result = await request.query(query);
    const courses = result.recordset || [];

    return res.send({
      code: 0,
      data: courses
    });
  } catch (error) {
    console.error("Error getting public course list:", error);
    return res.send({ code: 500, message: "Error retrieving courses" });
  }
});

// Public endpoint for getting unit standards
router.get("/publicUnitStandards", async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();
    const category = req.query.category; // "Work & Life Skills" or "Farming & Horticulture"

    let query = `
      SELECT UnitStandardID, US, USName, USCredits, USLevel
      FROM tblUnitStandard
      WHERE (IsDeleted IS NULL OR IsDeleted = 0)
    `;

    // Filter by category if provided
    if (category) {
      request.input("category", sql.VarChar, category);
      query += ` AND USCategory = @category`;
    }

    query += ` ORDER BY US`;

    const result = await request.query(query);
    const unitStandards = result.recordset || [];

    return res.send({
      code: 0,
      data: unitStandards
    });
  } catch (error) {
    console.error("Error getting unit standards:", error);
    return res.send({ code: 500, message: "Error retrieving unit standards" });
  }
});

// Admin endpoint: Update course category
router.put("/updateCourseCategory", isAuthenticated, async (req, res, next) => {
  const { CourseID, CourseCategory } = req.body;

  try {
    const pool = await getPool();
    const request = pool.request();

    const query = `
      UPDATE tblCourse
      SET CourseCategory = @CourseCategory, UpdateDate = GETDATE(), UpdateUser = @UpdateUser
      WHERE CourseID = @CourseID
    `;

    request.input("CourseID", sql.Int, CourseID);
    request.input("CourseCategory", sql.VarChar, CourseCategory);
    request.input("UpdateUser", sql.VarChar, req?.info?.displayName);

    await request.query(query);

    res.send({ code: 0, data: true, message: "Course category updated successfully" });
  } catch (error) {
    console.error("Error updating course category:", error);
    next(error);
  }
});

// Admin endpoint: Update unit standard category
router.put("/updateUnitStandardCategory", isAuthenticated, async (req, res, next) => {
  const { UnitStandardID, USCategory } = req.body;

  try {
    const pool = await getPool();
    const request = pool.request();

    const query = `
      UPDATE tblUnitStandard
      SET USCategory = @USCategory, UpdateDate = GETDATE(), UpdateUser = @UpdateUser
      WHERE UnitStandardID = @UnitStandardID
    `;

    request.input("UnitStandardID", sql.Int, UnitStandardID);
    request.input("USCategory", sql.VarChar, USCategory);
    request.input("UpdateUser", sql.VarChar, req?.info?.displayName);

    await request.query(query);

    res.send({ code: 0, data: true, message: "Unit standard category updated successfully" });
  } catch (error) {
    console.error("Error updating unit standard category:", error);
    next(error);
  }
});

// Admin endpoint: Get all courses with categories for settings management
router.get("/coursesWithCategories", isAuthenticated, async (req, res, next) => {
  try {
    const pool = await getPool();
    const request = pool.request();

    const query = `
      SELECT CourseID, CourseName, CourseDetails, CourseLevel, CourseCredits,
             CourseCategory, IsCustom
      FROM tblCourse
      WHERE (IsDeleted IS NULL OR IsDeleted = 0)
      ORDER BY CourseName
    `;

    const result = await request.query(query);

    res.send({ code: 0, data: result.recordset || [] });
  } catch (error) {
    console.error("Error getting courses with categories:", error);
    next(error);
  }
});

// Admin endpoint: Get all unit standards with categories for settings management
router.get("/unitStandardsWithCategories", isAuthenticated, async (req, res, next) => {
  try {
    const pool = await getPool();
    const request = pool.request();

    const query = `
      SELECT UnitStandardID, US, USName, USLevel, USCredits, USCategory
      FROM tblUnitStandard
      WHERE (IsDeleted IS NULL OR IsDeleted = 0)
      ORDER BY US
    `;

    const result = await request.query(query);

    res.send({ code: 0, data: result.recordset || [] });
  } catch (error) {
    console.error("Error getting unit standards with categories:", error);
    next(error);
  }
});

// Admin endpoint: Get category notification settings
router.get("/getCategoryNotificationSettings", isAuthenticated, async (req, res, next) => {
  try {
    const pool = await getPool();
    const request = pool.request();

    const query = `
      SELECT CategoryName, NotificationEmail
      FROM tblRemoteRegistrationCategorySettings
      ORDER BY CategoryName
    `;

    const result = await request.query(query);

    res.send({ code: 0, data: result.recordset || [] });
  } catch (error) {
    console.error("Error getting category notification settings:", error);

    // Check if the error is due to table not existing
    if (error.message && error.message.includes('Invalid object name')) {
      return res.send({
        code: 1,
        message: "Database table not found. Please run the SQL script: server_V1.1-main/server_V1.1-main/database/add_category_notification_emails.sql",
        data: []
      });
    }

    next(error);
  }
});

// Admin endpoint: Update category notification email
router.put("/updateCategoryNotificationEmail", isAuthenticated, async (req, res, next) => {
  const { CategoryName, NotificationEmail } = req.body;

  try {
    const pool = await getPool();
    const request = pool.request();

    const query = `
      UPDATE tblRemoteRegistrationCategorySettings
      SET NotificationEmail = @NotificationEmail,
          UpdatedDate = GETDATE(),
          UpdatedBy = @UpdatedBy
      WHERE CategoryName = @CategoryName
    `;

    request.input("CategoryName", sql.VarChar, CategoryName);
    request.input("NotificationEmail", sql.VarChar, NotificationEmail);
    request.input("UpdatedBy", sql.VarChar, req?.info?.displayName);

    await request.query(query);

    res.send({ code: 0, data: true, message: "Notification email updated successfully" });
  } catch (error) {
    console.error("Error updating category notification email:", error);
    next(error);
  }
});

module.exports = router;
