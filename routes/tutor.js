const express = require("express");
const router = express.Router();
const isAuthenticated = require("./auth");
const { getPagination, getPool } = require("./utils");
const sql = require("mssql");
const { nanoid } = require("nanoid");
const { email } = require("./email/send");
const QRCode = require("qrcode");

router.get("/list", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();

    const query = `SELECT DeliverySpecialist, MarkAsDefault FROM tblDeliverySpecialist WHERE DeliverySpecialistActive = 1`;

    request.query(query, (err, result) => {
      if (err) console.log(err);
      if (result?.recordset) {
        const d = result.recordsets[0] || [];

        return res.send({
          code: 0,
          data: d.map((e) => e.DeliverySpecialist),
        });
      }
      return res.send({ code: 0, data: [] });
    });
  } catch (error) {
    next(error);
  }
});


router.get("/Alllist", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();

    let query = `SELECT Id, DeliverySpecialist, MarkAsDefault, UserId FROM tblDeliverySpecialist 
    WHERE DeliverySpecialistActive = 1 `;

    const DeliverySpecialist = req.query.DeliverySpecialist;

    if (DeliverySpecialist) {
      request.input("TeacherName", sql.VarChar, `${DeliverySpecialist}%`);
      query += ` AND DeliverySpecialist Like @TeacherName`;
    }

    request.query(query, (err, result) => {
      if (err) console.log(err);
      if (result?.recordset) {
        const d = result.recordsets[0] || [];

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


router.get("/student", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();

    const current = Number(req.query.current || 1);
    const pageSize = Number(req.query.pageSize || 10);
    const startIndex = (current - 1) * pageSize;
    const name = req.query.name || "";
    const School = req.query.School || "";
    const Email = req.query.Email || "";
    const AssignedTo = req.query.AssignedTo || "";
    const LearnerStatus = req.query.LearnerStatus || "";
    const FollowUp = req.query.FollowUp || "";
    const AllStatus = req.query.AllStatus || [];
    const AllStatusValue = Array.isArray(AllStatus) ? AllStatus.join(",") : "";
    const CourseID = req.query.CourseID || [];
    const UnitStandardID = req.query.UnitStandardID || [];
    const LearnerType = req.query.learnerType || "";
    const LastCommDate = req.query.lastCommDate || "";

    request.input("name", sql.VarChar, name);
    request.input("email", sql.VarChar, Email);
    request.input("School", sql.VarChar, School);
    request.input("startIndex", sql.Int, startIndex);
    request.input("pageSize", sql.Int, pageSize);
    request.input("AssignedTo", sql.VarChar, AssignedTo);
    request.input("Status", sql.VarChar, LearnerStatus);
    request.input("AllStatus", sql.VarChar, AllStatusValue || "");
    request.input("FollowUp", sql.VarChar, FollowUp);
    request.input("CourseID", sql.Int, CourseID || 0);
    request.input("UnitStandardID", sql.Int, UnitStandardID || 0);
    request.input("LearnerType", sql.Int, LearnerType || 0);
    request.input("LastCommDate", sql.VarChar, LastCommDate || "");

    console.log("CourseID");
    console.log(CourseID);
    
    console.log("UnitStandardID");
    console.log(UnitStandardID);
    
    const query = `
    WITH FilteredStudents AS (
      SELECT *
      FROM tblStudentInfo s
      WHERE (s.FirstName LIKE '' + @name + '%' 
      OR s.LastName LIKE '' + @name + '%')
      AND (ISNULL(Code, '') = '') 
      AND (ISNULL(@School, '') = '' OR s.School LIKE '%' + @School + '%')
      AND ((ISNULL(@email, '') = '') OR (s.TutorId IN (SELECT Id FROM   tblDeliverySpecialist WHERE (UserId = (SELECT Id FROM   tblAdminUser WHERE (Email = @email)))))) 
      AND (ISNULL(@AssignedTo, '') = '' OR (s.AssignedTo = @AssignedTo AND ISNULL(s.Status, 'On Going') = 'On Going'))
      AND (ISNULL(@Status, '') = '' OR s.Status LIKE '%' + @Status + '%')
      AND (ISNULL(@LastCommDate, '') = '' OR s.LastCommunicateDate = @LastCommDate)
      AND (@LearnerType = 0 OR StudentID IN (SELECT StudentID from tblStudentInCourse WHERE LearnerType = @LearnerType))
      AND (@CourseID = 0 OR StudentID IN (SELECT StudentID from tblStudentInCourse WHERE CourseID = @CourseID))
      AND (@UnitStandardID = 0 OR StudentID IN (SELECT StudentID from tblStudentInCourseUnitStandard WHERE UnitStandardID = @UnitStandardID))
      AND (ISNULL(@AllStatus, '') = '' OR s.Status IN (SELECT value FROM STRING_SPLIT(@AllStatus, ',')))
	    AND ((ISNULL(@FollowUp, '') = '') OR ((ISNULL(LastCommunicateDate, '') = '' OR DATEDIFF(DAY, LastCommunicateDate, GETDATE()) > 30) AND ISNULL(s.Status, 'On Going') = 'On Going'))
      AND (s.IsDeleted IS NULL OR s.IsDeleted = 0)
      )
      SELECT COUNT(*) AS totalRows
      FROM FilteredStudents;

      WITH FilteredStudentsPaged AS (
        SELECT *, ROW_NUMBER() OVER (ORDER BY StudentID) AS RowNum
        FROM tblStudentInfo s
        WHERE (s.FirstName LIKE '' + @name + '%' 
        OR s.LastName LIKE '' + @name + '%')
        AND (ISNULL(Code, '') = '') 
        AND (ISNULL(@School, '') = '' OR s.School LIKE '%' + @School + '%')
        AND ((ISNULL(@email, '') = '') OR (s.TutorId IN (SELECT Id FROM   tblDeliverySpecialist WHERE (UserId = (SELECT Id FROM   tblAdminUser WHERE (Email = @email)))))) 
        AND (ISNULL(@AssignedTo, '') = '' OR (s.AssignedTo = @AssignedTo AND ISNULL(s.Status, 'On Going') = 'On Going'))
        AND (ISNULL(@Status, '') = '' OR s.Status LIKE '%' + @Status + '%')
        AND (ISNULL(@LastCommDate, '') = '' OR s.LastCommunicateDate = @LastCommDate)
        AND (@LearnerType = 0 OR StudentID IN (SELECT StudentID from tblStudentInCourse WHERE LearnerType = @LearnerType))
        AND (@CourseID = 0 OR StudentID IN (SELECT StudentID from tblStudentInCourse WHERE CourseID = @CourseID))
        AND (@UnitStandardID = 0 OR StudentID IN (SELECT StudentID from tblStudentInCourseUnitStandard WHERE UnitStandardID = @UnitStandardID))
        AND (ISNULL(@AllStatus, '') = '' OR s.Status IN (SELECT value FROM STRING_SPLIT(@AllStatus, ',')))
	      AND ((ISNULL(@FollowUp, '') = '') OR ((ISNULL(LastCommunicateDate, '') = '' OR DATEDIFF(DAY, LastCommunicateDate, GETDATE()) > 30) AND ISNULL(s.Status, 'On Going') = 'On Going'))
        AND (s.IsDeleted IS NULL OR s.IsDeleted = 0)
      )
      SELECT *
      FROM FilteredStudentsPaged
      WHERE RowNum BETWEEN @startIndex + 1 AND @startIndex + @pageSize
      ORDER BY StudentID;
  `;
  console.log(query);
    request.query(query, (err, result) => {
      if (err) console.log(err);
      if (result?.recordset) {
        const total = result.recordsets[0][0].totalRows;
        const currentPageData = result.recordsets[1];

        return res.send({
          code: 0,
          data: currentPageData,
          pagination: getPagination(current, pageSize, total),
        });
      }

      return res.send({ code: 0, data: [], pagination: getPagination() });
    });
  } catch (error) {
    next(error);
  }
});

router.get("/course/student", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();
    const CourseID = Number(req.query.CourseID);
    const UnitStandardID = Number(req.query.UnitStandardID);
    const DeliverySpecialist = req.query.DeliverySpecialist || "";
    const CourseDate = req.query.CourseDate || "";
    if (!CourseID || !UnitStandardID || !DeliverySpecialist) {
      return res.send({ code: 0, data: [] });
    }
    request.input("CourseID", sql.Int, CourseID);
    request.input("UnitStandardID", sql.Int, UnitStandardID);
    request.input("DeliverySpecialist", sql.VarChar, DeliverySpecialist);
    request.input("CourseDate", sql.VarChar, CourseDate);
    const query = `
    WITH CTE AS (
      SELECT DISTINCT sc.StudentID,sc.CourseDate
      FROM tblStudentCourse sc
      RIGHT OUTER JOIN tblStudentCourseUnitStandard scu ON scu.StudentCourseID = sc.StudentCourseID
      WHERE sc.DeliverySpecialist = @DeliverySpecialist
        AND sc.CourseID = @CourseID
        AND sc.CourseDate LIKE '%' + @CourseDate + '%' 
        AND scu.UnitStandardID = @UnitStandardID
  )
  SELECT s.*, cte.CourseDate
  FROM CTE cte
  LEFT JOIN tblStudent s ON cte.StudentID = s.StudentID;`;

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

function generate6DigitNumber() {
  return Math.floor(100000 + Math.random() * 900000);
}

router.post("/workshop", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();
    const CourseID = Number(req.body.CourseID);
    const StudentsNum = Number(req.body.StudentsNum);
    const SchoolNumber = Number(req.body.SchoolNumber);
    const TutorId = Number(req.body.TutorId);
    const UnitStandardIDs = req.body.UnitStandardIDs;
    
    const {
      CourseDate = "",
      SchoolName = "",
      Location,
      CourseName = "",
      PaymentStatus = "",
    } = req.body;
    const Tutor = req?.info?.displayName || "";

    if (!CourseID || !SchoolName || !CourseDate) {
      return res.send({ code: 1, message: "Please select" });
    }
    const Code = generate6DigitNumber();
    request.input("CourseID", sql.Int, CourseID);
    request.input("SchoolNumber", sql.Int, SchoolNumber);
    request.input("StudentsNum", sql.Int, StudentsNum);
    request.input("CourseDate", sql.VarChar, CourseDate);
    request.input("SchoolName", sql.VarChar, SchoolName);
    request.input("Location", sql.VarChar, Location);
    request.input("CourseName", sql.VarChar, CourseName);
    request.input("Code", sql.VarChar, Code+"");
    request.input("PaymentStatus", sql.VarChar, PaymentStatus);
    request.input("TutorId", sql.Int, TutorId);
    var unitstandardid = "";
    if(UnitStandardIDs){
      unitstandardid = UnitStandardIDs.join(',');
    }
    request.input("UnitStandardIDs", sql.VarChar, unitstandardid);

    const query = `
    BEGIN TRANSACTION 
    DECLARE @CurrentDateTime DATETIME = GETDATE();
    DECLARE @Tutor NVARCHAR(MAX) = NULL;
    DECLARE @IsUse INT = 0;

    SELECT @IsUse = COUNT(*) FROM tblWorkshop WHERE Code = @Code

    IF(@TutorId > 0)
    BEGIN
      SELECT TOP(1) @Tutor = DeliverySpecialist FROM   tblDeliverySpecialist WHERE Id = @TutorId;
    END

    IF(@IsUse = 0)
    BEGIN
      INSERT INTO tblWorkshop (CourseID,CourseName,CourseDate,SchoolName,Location,Tutor,CreateDate,Code,StudentsNum,SchoolNumber, PaymentStatus, TutorId, UnitStandardIDs)
      VALUES (@CourseID,@CourseName,@CourseDate,@SchoolName,@Location,@Tutor,@CurrentDateTime, @Code,@StudentsNum,@SchoolNumber, @PaymentStatus, @TutorId, @UnitStandardIDs);
    END
    ELSE
    BEGIN
      THROW 50001, 'The workshop code already use try it again.', 1;
    END

    IF(@@ERROR > 0)
    BEGIN
        ROLLBACK;
    END
    ELSE
    BEGIN
        COMMIT;
    END
    
    `;

    request.query(query, async (err) => {
      if (err){
        if (err.number === 50001) {
          return res.send({
            code: 1,
            data: false,
            message: err.message, // Maximum capacity reached
          });
        }
      }

      // Generate QR code
      try {
        const enrollmentUrl = `${req.protocol}://${req.get('host')}/learner?code=${Code}`;
        const qrCodeDataUrl = await QRCode.toDataURL(enrollmentUrl, {
          width: 300,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        });

        return res.send({
          code: 0,
          data: {
            code: Code,
            qrCode: qrCodeDataUrl
          },
        });
      } catch (qrError) {
        console.error('QR Code generation error:', qrError);
        // Fallback: return code without QR if generation fails
        return res.send({
          code: 0,
          data: Code,
        });
      }
    });
  } catch (error) {
    next(error);
  }
});


router.post("/workshopUpdate", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();
    const CourseID = Number(req.body.CourseID);
    const StudentsNum = Number(req.body.StudentsNum);
    const SchoolNumber = Number(req.body.SchoolNumber);
    const {
      CourseDate,
      SchoolName,
      Location,
      CourseName,
      PaymentStatus,
      WorkshopID,
      TutorId,
      UnitStandardIDs
    } = req.body;
    const Tutor = req?.info?.displayName || "";

    if (!CourseID || !SchoolName) {
      return res.send({ code: 1, message: "Please select" });
    }
    const Code = nanoid();
    
    let unitstandardid = "";
    if (UnitStandardIDs && Array.isArray(UnitStandardIDs)) {
      unitstandardid = UnitStandardIDs.join(",");
    }
    request.input("CourseID", sql.Int, CourseID);
    request.input("SchoolNumber", sql.Int, SchoolNumber);
    request.input("StudentsNum", sql.Int, StudentsNum);
    request.input("CourseDate", sql.VarChar, CourseDate);
    request.input("SchoolName", sql.VarChar, SchoolName);
    request.input("Location", sql.VarChar, Location);
    request.input("CourseName", sql.VarChar, CourseName);
    request.input("WorkshopID", sql.Int, WorkshopID);
    request.input("TutorId", sql.Int, TutorId);
    request.input("PaymentStatus", sql.VarChar, PaymentStatus);
    request.input("UnitStandardIDs", sql.VarChar, unitstandardid); 
    request.input("LearnerType", sql.Int, 2);
    request.input("CourseType", sql.VarChar, "Workshop");

    const query = `
    BEGIN TRANSACTION
      DECLARE @CurrentDateTime DATETIME = GETDATE();
      DECLARE @Tutor NVARCHAR(MAX) = NULL;
      DECLARE @Code NVARCHAR(MAX);
      SELECT TOP 1 @Code = Code FROM tblWorkshop WHERE WorkshopID =  @WorkshopID

      IF(@TutorId > 0)
      BEGIN
        SELECT TOP(1) @Tutor = DeliverySpecialist FROM   tblDeliverySpecialist WHERE Id = @TutorId;
      END

      Update tblWorkshop 
      SET CourseID = @CourseID,
      CourseName = @CourseName,
      CourseDate = @CourseDate,
      SchoolName = @SchoolName,
      Location = @Location,
      Tutor = @Tutor,
      StudentsNum = @StudentsNum,
      SchoolNumber = @SchoolNumber, 
      PaymentStatus = @PaymentStatus,
      TutorId = @TutorId,
      UnitStandardIDs = @UnitStandardIDs 
      WHERE (WorkshopID = @WorkshopID);
      
      UPDATE tblStudentInCourse SET CourseID = @CourseID WHERE Code = @Code;

      -- Preserve assessment data when updating workshop unit standards
      -- Step 1: Get the list of unit standards that should exist for this workshop
      DECLARE @NewUnitStandards TABLE (UnitStandardID INT);
      INSERT INTO @NewUnitStandards (UnitStandardID)
      SELECT DISTINCT UnitStandardID FROM [dbo].[tblCourseUnitStandard]
      WHERE CourseID = @CourseID OR (ISNULL(@UnitStandardIDs, '') <> '' AND UnitStandardID IN (SELECT CAST(value AS INT) FROM STRING_SPLIT(@UnitStandardIDs, ',')));

      -- Step 2: Delete unit standards that are no longer part of this workshop (but preserve assessed ones if they exist)
      DELETE FROM tblStudentInCourseUnitStandard
      WHERE SICId IN (SELECT id FROM tblStudentInCourse WHERE Code = @Code)
        AND UnitStandardID NOT IN (SELECT UnitStandardID FROM @NewUnitStandards)
        AND (UnitStatus IS NULL OR UnitStatus = '');  -- Only delete if NOT assessed

      -- Step 3: Insert new unit standards that don't exist yet (this will preserve existing ones with their UnitStatus)
      INSERT INTO tblStudentInCourseUnitStandard
      (StudentID, SICId, Code, CourseID, UnitStandardID, IsAditional, IsActive, CreatDate, LastModifyDate)
      SELECT SIC.StudentID, SIC.id, @Code, SIC.CourseID, U.UnitStandardID, 0, 1, GETDATE(), GETDATE()
      FROM tblStudentInCourse SIC
      CROSS JOIN @NewUnitStandards U
      WHERE SIC.Code = @Code
        AND NOT EXISTS (
          SELECT 1 FROM tblStudentInCourseUnitStandard USIC
          WHERE USIC.SICId = SIC.id AND USIC.UnitStandardID = U.UnitStandardID
        );
      
      IF(@@ERROR > 0)
      BEGIN
        ROLLBACK;
      END
      BEGIN
        COMMIT;
      END
    `;
console.log("query");
console.log(query);
    request.query(query, (err) => {
      if (err) console.log(err);
      return res.send({
        code: 0,
        data: Code,
      });
    });
  } catch (error) {
    next(error);
  }
});




router.post("/workshopDelete", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();
    const {WorkshopID} = req.body;

    if (!WorkshopID) {
      return res.send({ code: 1, message: "Please select" });
    }

    const Code = nanoid();
    request.input("WorkshopID", sql.Int, WorkshopID);

    const query = `
    Update tblWorkshop SET IsDeleted = 1 WHERE (WorkshopID = @WorkshopID);
    `;

    request.query(query, (err) => {
      if (err) console.log(err);
      return res.send({
        code: 0,
        data: Code,
      });
    });
  } catch (error) {
    next(error);
  }
});

router.get("/workshop", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();
    const CourseID = Number(req.query.CourseID);
    const Code = req.query?.Code;
    const email = req.query?.Email;
    const status = req.query?.Status;
    const schoolNumber = req.query?.SchoolNumber;
    
    const CreateUser = req?.info?.displayName;
    let query = `
    SELECT W.* 
    FROM tblWorkshop W 
    INNER JOIN tblDeliverySpecialist T ON W.TutorId = T.Id
    WHERE IsDeleted=0
    `;
    if (!isNaN(CourseID)) {
      request.input("CourseID", sql.Int, CourseID);
      query += ` AND CourseID = @CourseID`;
    }
    if (Code) {
      request.input("Code", sql.VarChar, Code);
      query += ` AND Code LIKE '%' + @Code + '%'`;
    }
    if (status && status != "All") {
      request.input("status", sql.VarChar, status);
      query += ` AND WorkshopStatus = @status`;
    }
    
    if (email) {
      request.input("email", sql.VarChar, email);
      query += ` AND TutorId IN (SELECT Id FROM   tblDeliverySpecialist WHERE (UserId = (SELECT Id FROM   tblAdminUser WHERE (Email = @email))))`;
    }
    
    if (schoolNumber > 0) {
      request.input("schoolNumber", sql.Int, schoolNumber);
      query += ` AND SchoolNumber = @schoolNumber`;
    }

/*
    if (CreateUser || !req?.admin) {
      request.input("CreateUser", sql.VarChar, CreateUser);
      query += ` AND Tutor = @CreateUser`;
    }*/

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


router.get("/workshopInforByCode", async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();
    const Code = req.query?.Code;
    let query = `
    SELECT * FROM tblWorkshop WHERE 1=1
    `;
    if (Code) {
      request.input("Code", sql.VarChar, Code);
      query += ` AND Code = @Code`;
    }
    else {
      return res.send({
        code: 1,
        data: false,
        message: "Code is required",
      });
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


router.get(
  "/workshop/student",
  isAuthenticated,
  async function (req, res, next) {
    try {
      const pool = await getPool();
      const request = await pool.request();

      const current = Number(req.query.current || 1);
      const pageSize = Number(req.query.pageSize || 10);
      const startIndex = (current - 1) * pageSize;
      const name = req.query.name || "";
      const School = req.query.School || "";

      request.input("name", sql.VarChar, name);

      request.input("startIndex", sql.Int, startIndex);
      request.input("pageSize", sql.Int, pageSize);

      let sq = `WHERE (ISNULL(Code, '') = '') AND (s.FirstName LIKE '' + @name + '%' 
        OR s.LastName LIKE '' + @name + '%')
        AND (s.IsDeleted IS NULL OR s.IsDeleted = 0)`;
      if (School) {
        request.input("School", sql.VarChar, School);
        sq += " AND s.SchoolName LIKE '' + @School + '%'";
      }

      const query = `
    WITH FilteredStudents AS (
      SELECT *
      FROM tblStudentInfo s
      ${sq}
      )
      SELECT COUNT(*) AS totalRows
      FROM FilteredStudents;

      WITH FilteredStudentsPaged AS (
        SELECT *, ROW_NUMBER() OVER (ORDER BY WorkshopResultID) AS RowNum
        FROM tblStudentInfo s
      ${sq}
      )
      SELECT *
      FROM FilteredStudentsPaged
      WHERE RowNum BETWEEN @startIndex + 1 AND @startIndex + @pageSize
      ORDER BY WorkshopResultID;
  `;

      request.query(query, (err, result) => {
        if (err) console.log(err);
        if (result?.recordset) {
          const total = result.recordsets[0][0].totalRows;
          const currentPageData = result.recordsets[1];

          return res.send({
            code: 0,
            data: currentPageData,
            pagination: getPagination(current, pageSize, total),
          });
        }

        return res.send({ code: 0, data: [], pagination: getPagination() });
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  "/workshop/allstudent",
  isAuthenticated,
  async function (req, res, next) {
    try {
      const pool = await getPool();
      const request = await pool.request();

      const current = Number(req.query.current || 1);
      const pageSize = Number(req.query.pageSize || 10);
      const startIndex = (current - 1) * pageSize;
      const name = req.query.name || "";
      const School = req.query.School || "";

      request.input("name", sql.VarChar, name);

      request.input("startIndex", sql.Int, startIndex);
      request.input("pageSize", sql.Int, pageSize);

      let sq = `WHERE (s.FirstName LIKE '' + @name + '%' 
        OR s.LastName LIKE '' + @name + '%')
        AND (s.IsDeleted IS NULL OR s.IsDeleted = 0)`;
      if (School) {
        request.input("School", sql.VarChar, School);
        sq += " AND s.SchoolName LIKE '' + @School + '%'";
      }

      const query = `
      WITH FilteredStudents AS (
      SELECT * FROM (
        SELECT s.Email, s.FirstName, s.LastName, s.DateOfBirth DOB, s.Gender, s.Ethnicity
        from [dbo].[tblStudentInfo] s 
        ${sq} ) x
		  GROUP BY x.FirstName, x.LastName, x.DOB, x.Gender, x.Ethnicity, x.Email
      )

      SELECT COUNT(*) AS totalRows
      FROM FilteredStudents;

      WITH FilteredStudentsPaged AS (

              SELECT  *, ROW_NUMBER() OVER (ORDER BY FirstName, LastName, DOB, Gender, Ethnicity, Email) AS RowNum
        FROM (
         SELECT s.Email, s.FirstName, s.LastName, s.DateOfBirth DOB, s.Gender, s.Ethnicity
        from [dbo].[tblStudentInfo] s
        ${sq}) x
                  GROUP BY x.FirstName, x.LastName, x.DOB, x.Gender, x.Ethnicity, x.Email 
      )
      SELECT *
      FROM FilteredStudentsPaged
      WHERE RowNum BETWEEN @startIndex + 1 AND @startIndex + @pageSize
      ORDER BY FirstName, LastName, DOB, Gender, Ethnicity, Email;
  `;

      request.query(query, (err, result) => {
        if (err) console.log(err);
        if (result?.recordset) {
          const total = result.recordsets[0][0].totalRows;
          const currentPageData = result.recordsets[1];

          return res.send({
            code: 0,
            data: currentPageData,
            pagination: getPagination(current, pageSize, total),
          });
        }

        return res.send({ code: 0, data: [], pagination: getPagination() });
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  "/workshop/result",
  isAuthenticated,
  async function (req, res, next) {
    try {
      const pool = await getPool();
      const request = await pool.request();
      const Code = req.query.Code;
      request.input("Code", sql.VarChar, Code);
      let query = `
      SELECT * FROM tblStudentInfo WHERE Code = @Code  AND (IsDeleted IS NULL OR IsDeleted = 0)
    `;

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
  }
);

router.get(
  "/workshop/courseresult",
  isAuthenticated,
  async function (req, res, next) {
    try {
      const pool = await getPool();
      const request = await pool.request();
      const Code = req.query.Code;
      request.input("Code", sql.VarChar, Code);
      let query = `
        SELECT CINS.id, CINS.CourseStatus, CINS.CourseID, CINS.Note, C.CourseName, CINS.CourseType, S.StudentID, S.Email, S.FirstName, S.LastName, S.DateOfBirth, S.Gender, S.Ethnicity, 
        S.PhoneNumber, S.School, S.SchoolNumber, S.TeacherName, S.TeacherEmail, S.InvoiceEmail, S.WorkbookOption, S.StreetAddress, S.City, S.Region, S.Zipcode, S.AdditionalInfo, S.HospitalityCourses, 
        S.WorklifeCourses, S.FarmingUnits, S.Tutor, S.CreateDate, S.Status, S.Result, S.IsDeleted, S.Fees, S.AdditionalDocuments, S.HospitalityCourseID, S.WorklifeCoursesID, S.FarmingUnitID, S.InternalNote, 
        S.TutorId, S.Code, S.SchoolName, S.Feedback, S.isAdd, S.StudentType, S.NSN
        FROM tblStudentInCourse CINS
		    INNER JOIN tblCourse C ON CINS.CourseID = C.CourseID
        INNER JOIN tblStudentInfo S ON CINS.StudentID = S.StudentID
        WHERE CINS.Code = @Code AND (S.IsDeleted IS NULL OR S.IsDeleted = 0)
    `;

    console.log("query");
    console.log(query);
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
  }
);

router.get("/verifyCode", async function (req, res, next) {
  try {
    const Code = req.query?.Code || "";
    if (!Code) {
      return res.send({
        code: 1,
        data: false,
        message: "Code is required",
      });
    }

    const pool = await getPool();
    const request = new sql.Request(pool);

    // Query to check if Code exists and if the number of students has reached the limit
    const query = `
      DECLARE @MaxStudents INT;
      DECLARE @CurrentCount INT;

      -- Check if Code exists
      IF EXISTS (SELECT 1 FROM tblWorkshop WHERE Code = @Code)
      BEGIN
        -- Get the maximum allowed number of students
        SELECT @MaxStudents = StudentsNum
        FROM tblWorkshop
        WHERE Code = @Code;

        -- Count current number of students
        SELECT @CurrentCount = COUNT(*)
        FROM tblStudentInfo
        WHERE Code = @Code AND (IsDeleted IS NULL OR IsDeleted = 0);

        -- Determine if the number of students has reached the maximum allowed
        IF (@CurrentCount >= @MaxStudents)
        BEGIN
          SELECT 1 AS IsFull; -- Indicates that the workshop is full
        END
        ELSE
        BEGIN
          SELECT 0 AS IsFull; -- Indicates that there is still space available
        END
      END
      ELSE
      BEGIN
        -- Code does not exist
        SELECT -1 AS IsFull;
      END
    `;

    request.input("Code", sql.VarChar, Code);

    // Execute query
    const result = await request.query(query);

    if (result?.recordset) {
      const isFull = result.recordset[0].IsFull;

      if (isFull === 1) {
        return res.send({
          code: 0,
          data: false,
          message: "The workshop is full. No more spots available.",
        });
      } else if (isFull === -1) {
        return res.send({
          code: 0,
          data: false,
          message: "Code not found.",
        });
      } else {
        return res.send({
          code: 0,
          data: true,
          message: "The workshop is available.",
        });
      }
    }

    // Default response if no recordset found
    return res.send({
      code: 0,
      data: false,
      message: "Unexpected error occurred.",
    });
  } catch (error) {
    console.error("Error verifying workshop code:", error);
    next(error);
  }
});

router.post("/workshop/info", async function (req, res, next) {

  try {
    const pool = await getPool();
    const request = await pool.request();
    const SchoolNumber = Number(req.body.SchoolNumber);
    const {
      Code,
      FirstName,
      LastName,
      SchoolName,
      Gender,
      DOB,
      Email,
      Ethnicity,
    } = req.body;

    // Validate required parameters
    if (!Code) {
      throw new Error("Code is required");
    }
    if (!FirstName || !LastName) {
      throw new Error("FirstName and LastName are required");
    }

    // Bind parameters
    request.input("Code", sql.VarChar, Code);
    request.input("FirstName", sql.VarChar, FirstName);
    request.input("LastName", sql.VarChar, LastName);
    request.input("Gender", sql.VarChar, Gender);
    request.input("DOB", sql.VarChar, DOB);
    request.input("Email", sql.VarChar, Email);
    request.input("Ethnicity", sql.VarChar, Ethnicity);
    request.input("SchoolNumber", sql.Int, SchoolNumber);
    request.input("LearnerType", sql.Int, 2);
    request.input("CourseType", sql.VarChar, "Workshop");
    
    // Query to perform the operations and get remaining spots
    const query = `
      DECLARE @CurrentCount INT;
      DECLARE @MaxStudents INT;
      DECLARE @RemainingSpots INT;
      DECLARE @StudentID INT = 0;
      DECLARE @CourseID INT;
      DECLARE @UnitStandardIDs NVARCHAR(MAX);
      DECLARE @IsExist INT;
      DECLARE @SICID INT;
      DECLARE @SchoolName NVARCHAR(MAX) = '';

      -- Lock the tblStudentInfo table to prevent concurrent inserts
      SELECT @CurrentCount = COUNT(*)
      FROM tblStudentInfo WITH (UPDLOCK, HOLDLOCK)
      WHERE Code = @Code AND (IsDeleted IS NULL OR IsDeleted = 0);

      SELECT @MaxStudents = StudentsNum
      FROM tblWorkshop
      WHERE Code = @Code;

      SELECT TOP 1 @SchoolName = SchoolName FROM [dbo].[tblSchoolWorkplace] WHERE SchoolNumber = @SchoolNumber

      -- Check if the number of students exceeds the limit
      IF (@CurrentCount < @MaxStudents)
      BEGIN
        DECLARE @CreateDate DATETIME = GETDATE();
        SELECT TOP 1 @StudentID = StudentID FROM tblStudentInfo WHERE FirstName = @FirstName AND LastName = @LastName AND Gender = @Gender AND Email = @Email AND Ethnicity = @Ethnicity AND DateOfBirth = @DOB
        IF(@StudentID < 1 OR @StudentID IS NULL)
        BEGIN
          -- Insert new student record for each workshop enrollment
          INSERT INTO tblStudentInfo (
            Code, FirstName, LastName, SchoolName, School, SchoolNumber, Gender, DateOfBirth, Email, Ethnicity, CreateDate, Status
          ) VALUES (
            @Code, @FirstName, @LastName, @SchoolName, @SchoolName, @SchoolNumber, @Gender, @DOB, @Email, @Ethnicity, @CreateDate, 'On Going'
          ) SELECT @StudentID = @@IDENTITY;
        END
        ELSE
        BEGIN
          -- Student exists, create a new record for this workshop to track multiple workshop enrollments
          INSERT INTO tblStudentInfo (
            Code, FirstName, LastName, SchoolName, School, SchoolNumber, Gender, DateOfBirth, Email, Ethnicity, CreateDate, Status
          ) VALUES (
            @Code, @FirstName, @LastName, @SchoolName, @SchoolName, @SchoolNumber, @Gender, @DOB, @Email, @Ethnicity, @CreateDate, 'On Going'
          ) SELECT @StudentID = @@IDENTITY;
        END

        -- Calculate remaining spots
        SET @RemainingSpots = @MaxStudents - (@CurrentCount + 1);

        SELECT TOP 1 @CourseID =  CourseID, @UnitStandardIDs = UnitStandardIDs from tblWorkshop WHERE Code = @Code

        SELECT @IsExist = COUNT(*) FROM tblStudentInCourse WHERE StudentID = @StudentID AND Code = @Code;
        IF(@IsExist = 0)
        BEGIN
          IF(@CourseID > 0)
          BEGIN
            INSERT INTO tblStudentInCourse(StudentID, Code, CourseID, IsActive, LearnerType, CourseType, CreatDate, LastModifyDate)
            VALUES   (@StudentID, @Code, @CourseID, 1, @LearnerType, @CourseType, GETDATE(), GETDATE());
            SELECT @SICID = @@IDENTITY;
            INSERT INTO tblStudentInCourseUnitStandard
            (StudentID, SICId, CourseID, UnitStandardID, IsAditional, IsActive, CreatDate, LastModifyDate)
            SELECT @StudentID, @SICID, @CourseID, UnitStandardID, 0, 1, GETDATE(), GETDATE() FROM [dbo].[tblCourseUnitStandard] WHERE CourseID = @CourseID OR (ISNULL(@UnitStandardIDs, '') <> '' AND UnitStandardID IN (SELECT CAST(value AS INT) FROM STRING_SPLIT(@UnitStandardIDs, ',')))
          END
        END
        ELSE
        BEGIN
         THROW 50001, 'The student already in this workshop.', 1;
        END
      END
      ELSE
      BEGIN
        -- If the number of students is full, throw an error
        THROW 50001, 'The workshop has reached its maximum capacity.', 1;
      END;

      -- Select remaining spots to return in the response
      SELECT @RemainingSpots AS RemainingSpots;
    `;

    // Execute the query and insert operation 
    
  const result = await request.query(query);
    
    return res.send({
      code: 0,
      data: true,
      message: "Student has been successfully added.",
      remainingSpots: result.recordset[0].RemainingSpots, // Access the remaining spots from the query result
    });
  } catch (error) {
    // Handle and return error messages
    if (error.number === 50001) {
      return res.send({
        code: 1,
        data: false,
        message: error.message, // Maximum capacity reached
      });
    }
    next(error); // Handle other unknown errors
  }
});

router.post(
  "/workshop/info/extra",
  isAuthenticated,
  async function (req, res, next) {
    try {
      const pool = await getPool();
      const request = await pool.request();
      const SchoolNumber = Number(req.body.SchoolNumber);
      const {
        Code,
        FirstName,
        LastName,
        SchoolName,
        Gender,
        DOB,
        Email,
        Ethnicity,
      } = req.body;

      if (!Code) {
        return res.send({ code: 1, message: "Code Error" });
      }

      if (!FirstName || !LastName) {
        return res.send({ code: 1, message: "Please select" });
      }

      request.input("Code", sql.VarChar, Code);
      request.input("FirstName", sql.VarChar, FirstName);
      request.input("LastName", sql.VarChar, LastName);
      request.input("SchoolName", sql.VarChar, SchoolName);
      request.input("Gender", sql.VarChar, Gender);
      request.input("DOB", sql.VarChar, DOB);
      request.input("Email", sql.VarChar, Email);
      request.input("Ethnicity", sql.VarChar, Ethnicity);
      request.input("SchoolNumber", sql.Int, SchoolNumber);
      const query = `
    DECLARE @CreateDate DATETIME = GETDATE();
    INSERT INTO tblWorkshopResult (Code,FirstName,LastName,SchoolName,SchoolNumber,Gender,DOB,Email,Ethnicity,CreateDate,isAdd)
    VALUES (@Code,@FirstName,@LastName,@SchoolName,@SchoolNumber,@Gender,@DOB,@Email,@Ethnicity,@CreateDate,1);
    `;

      request.query(query, (err) => {
        if (err) console.log(err);
        return res.send({
          code: 0,
          data: "success",
        });
      });
    } catch (error) {
      next(error);
    }
  }
);



router.post(
  "/workshop/workshopstudent",
  isAuthenticated,
  async function (req, res, next) {
    try {
      const pool = await getPool();
      const request = await pool.request();
      const SchoolNumber = Number(req.body.SchoolNumber);
      const {
        Code,
        FirstName,
        LastName,
        SchoolName,
        Gender,
        DOB,
        Email,
        Ethnicity,
      } = req.body;

      console.log("req.body");
      console.log(req.body);

      if (!Code) {
        return res.send({ code: 1, message: "Code Error" });
      }

      if (!FirstName || !LastName) {
        return res.send({ code: 1, message: "Please select" });
      }

      request.input("Code", sql.VarChar, Code);
      request.input("FirstName", sql.VarChar, FirstName);
      request.input("LastName", sql.VarChar, LastName);
      request.input("SchoolName", sql.VarChar, SchoolName);
      request.input("Gender", sql.VarChar, Gender);
      request.input("DOB", sql.VarChar, DOB);
      request.input("Email", sql.VarChar, Email);
      request.input("Ethnicity", sql.VarChar, Ethnicity);
      request.input("SchoolNumber", sql.Int, SchoolNumber);
      request.input("LearnerType", sql.Int, 2);
      request.input("CourseType", sql.VarChar, "Workshop");
      const query = `
      BEGIN TRANSACTION
      DECLARE @CreateDate DATETIME = GETDATE();
      DECLARE @StudentID INT = 0;
      DECLARE @IsExist INT;
      DECLARE @CourseID INT;
      DECLARE @SICID INT;
      DECLARE @StdCCode NVARCHAR(MAX);
      DECLARE @UnitStandardIDs NVARCHAR(MAX);
      SELECT TOP 1 @CourseID =  CourseID, @UnitStandardIDs = UnitStandardIDs from tblWorkshop WHERE Code = @Code
      IF(@CourseID > 0)
      BEGIN

      SELECT TOP 1 @StudentID = StudentID, @StdCCode = Code FROM tblStudentInfo WHERE FirstName = @FirstName AND LastName = @LastName AND Gender = @Gender AND Email = @Email AND Ethnicity = @Ethnicity AND DateOfBirth = @DOB
      IF(@StudentID < 1 OR @StudentID IS NULL)
      BEGIN
        -- Insert new student record for each workshop enrollment
        INSERT INTO tblStudentInfo (Code,FirstName,LastName,SchoolName,SchoolNumber,Gender,DateOfBirth,Email,Ethnicity,CreateDate,isAdd, Status)
        VALUES (@Code,@FirstName,@LastName,@SchoolName,@SchoolNumber,@Gender,@DOB,@Email,@Ethnicity,@CreateDate,1, 'On Going')
        SELECT @StudentID = @@IDENTITY;
      END
      ELSE
      BEGIN
        -- Student exists, create a new record for this workshop to track multiple workshop enrollments
        INSERT INTO tblStudentInfo (Code,FirstName,LastName,SchoolName,SchoolNumber,Gender,DateOfBirth,Email,Ethnicity,CreateDate,isAdd, Status)
        VALUES (@Code,@FirstName,@LastName,@SchoolName,@SchoolNumber,@Gender,@DOB,@Email,@Ethnicity,@CreateDate,1, 'On Going')
        SELECT @StudentID = @@IDENTITY;
      END
        SELECT @IsExist = COUNT(*) FROM tblStudentInCourse WHERE StudentID = @StudentID AND Code = @Code;
        IF(@IsExist = 0)
        BEGIN
          INSERT INTO tblStudentInCourse(StudentID, Code, CourseID, IsActive, LearnerType, CourseType, CreatDate, LastModifyDate)
          VALUES   (@StudentID, @Code, @CourseID, 1, @LearnerType, @CourseType, GETDATE(), GETDATE());
          SELECT @SICID = @@IDENTITY;
          INSERT INTO tblStudentInCourseUnitStandard
          (StudentID, SICId, CourseID, UnitStandardID, IsAditional, IsActive, CreatDate, LastModifyDate)
          SELECT @StudentID, @SICID, @CourseID, UnitStandardID, 0, 1, GETDATE(), GETDATE() FROM [dbo].[tblCourseUnitStandard] WHERE  CourseID = @CourseID OR (ISNULL(@UnitStandardIDs, '') <> '' AND UnitStandardID IN (SELECT CAST(value AS INT) FROM STRING_SPLIT(@UnitStandardIDs, ',')))
        END
        ELSE
        BEGIN
         THROW 50001, 'The student already in this workshop.', 1;
        END
      END

      IF(@@ERROR > 0)
      BEGIN
        ROLLBACK;
      END
      BEGIN
        COMMIT;
      END
    ;
    `;

    console.log("query");
    
      console.log("Code", Code);
      console.log("FirstName", FirstName);
      console.log("LastName", LastName);
      console.log("SchoolName", SchoolName);
      console.log("Gender", Gender);
      console.log("DOB", DOB);
      console.log("Email", Email);
      console.log("Ethnicity", Ethnicity);
      console.log("SchoolNumber", SchoolNumber);
      console.log("LearnerType", 2);
      console.log("CourseType", "Workshop");

    console.log(query);

      request.query(query, (err) => {        
        if (err){
          if (err.number === 50001) {
            return res.send({
              code: 1,
              data: false,
              message: err.message, // Maximum capacity reached
            });
          }
        }
        return res.send({
          code: 0,
          data: "success",
        });
      });
    } catch (error) {      
      console.log("error");
      console.log(error);
      /*
      if (error.number === 50001) {
        return res.send({
          code: 1,
          data: false,
          message: error.message, // Maximum capacity reached
        });
      }*/
      next(error);
    }

    /*
    } catch (error) {
    try {
      // Rollback the transaction if an error occurs
      await transaction.rollback();
    } catch (rollbackError) {
      console.error("Error rolling back transaction:", rollbackError);
    }

    console.error("Error processing request:", error);

    // Handle and return error messages
    if (error.number === 50001) {
      return res.send({
        code: 1,
        data: false,
        message: error.message, // Maximum capacity reached
      });
    }
    next(error); // Handle other unknown errors
  }
    */
  }
);

router.post(
  "/workshop/info/update",
  isAuthenticated,
  async function (req, res, next) {
    try {
      const pool = await getPool();
      const request = await pool.request();
      const StudentID = Number(req.body.StudentID);
      const SchoolNumber = Number(req.body.SchoolNumber);
      const { FirstName, LastName, SchoolName, Gender, DOB, Email, Status, Ethnicity, Fees } =
        req.body;

      // Validate required fields
      if (!StudentID) {
        return res.send({ code: 1, message: "WorkshopResultID is required" });
      }

      if (!FirstName || !LastName) {
        return res.send({
          code: 1,
          message: "First Name and Last Name are required",
        });
      }

      request.input("FirstName", sql.VarChar, FirstName);
      request.input("LastName", sql.VarChar, LastName);

      request.input("Gender", sql.VarChar, Gender);
      request.input("DOB", sql.VarChar, DOB);
      request.input("Email", sql.VarChar, Email);
      request.input("Status", sql.VarChar, Status);
      request.input("Fees", sql.VarChar, Fees);
      request.input("Ethnicity", sql.VarChar, Ethnicity);

      request.input("StudentID", sql.Int, StudentID);

      let school = "";
      if (SchoolNumber) {
        request.input("SchoolNumber", sql.Int, SchoolNumber);
        school += "SchoolNumber = @SchoolNumber,";
      } else if (SchoolNumber === 0) {
        school += "SchoolNumber = NULL ,";
      }

      if (SchoolName) {
        request.input("SchoolName", sql.VarChar, SchoolName);
        school += "SchoolName = @SchoolName,";
      }
      const query = `
          UPDATE tblStudentInfo
          SET FirstName = @FirstName,
              LastName = @LastName,
              ${school}
              Gender = @Gender,
              DOB = @DOB,
              Ethnicity = @Ethnicity,
              Email = @Email,
              Status = @Status,
              Fees = @Fees
          WHERE StudentID = @StudentID;
        `;

      request.query(query, (err) => {
        if (err) console.log(err);
        return res.send({
          code: 0,
          data: "success",
        });
      });
    } catch (error) {
      next(error); // Pass error to the error-handling middleware
    }
  }
);


router.post(
  "/workshop/StatusChange",
  isAuthenticated,
  async function (req, res, next) {
    try {
      const pool = await getPool();
      const request = await pool.request();
      const Code = req.body.code;
      const {Status } = req.body;

      // Validate required fields
      if (!Code) {
        return res.send({ code: 1, message: "Workshop Code is required" });
      }

      if (!Status) {
        return res.send({
          code: 1,
          message: "Status are required",
        });
      }
      request.input("Status", sql.VarChar, Status);
      request.input("Code", sql.VarChar, Code);

      const query = `
          UPDATE tblWorkshop SET WorkshopStatus = @Status WHERE Code = @Code;
        `;
        email("E0001", `Workshop Completion Notification - Code:${Code}`, Code, Status);
      request.query(query, (err) => {
        if (err) console.log(err);
        return res.send({
          code: 0,
          data: "success",
        });
      });
    } catch (error) {
      next(error); // Pass error to the error-handling middleware
    }
  }
);

router.post(
  "/workshop/PaymentStatusChange",
  isAuthenticated,
  async function (req, res, next) {
    try {
      const pool = await getPool();
      const request = await pool.request();
      const { WorkshopID, PaymentStatus } = req.body;

      // Validate required fields
      if (!WorkshopID) {
        return res.send({ code: 1, message: "Workshop ID is required" });
      }

      if (!PaymentStatus) {
        return res.send({
          code: 1,
          message: "Payment Status is required",
        });
      }

      request.input("PaymentStatus", sql.VarChar, PaymentStatus);
      request.input("WorkshopID", sql.Int, WorkshopID);

      const query = `
        UPDATE tblWorkshop SET PaymentStatus = @PaymentStatus WHERE WorkshopID = @WorkshopID;
      `;

      request.query(query, (err) => {
        if (err) {
          console.log(err);
          return res.send({
            code: 1,
            message: "Error updating payment status",
          });
        }
        return res.send({
          code: 0,
          data: "success",
          message: "Payment status updated successfully",
        });
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post("/workshop/info/delete", isAuthenticated, async function (req, res, next) {
    try {
      const { StudentID } = req.body;
      if (!StudentID) {
        return res.send({ code: 400, message: "EnrollmentID is required" });
      }

      const pool = await getPool();
      const request = await pool.request();
      request.input("StudentID", sql.Int, StudentID);

      const query = `
      UPDATE tblStudentInfo
      SET IsDeleted = 1
      WHERE StudentID = @StudentID;
    `;

      await request.query(query);
      return res.send({
        code: 0,
        data: "success",
        message: "Delete successful",
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get("/workshop/course-with-units", isAuthenticated, async function (req, res, next) {
    try {
      const pool = await getPool();
      const request = await pool.request();
      const Code = req.query.Code;

      if (!Code) {
        return res.send({ code: 400, message: "Missing workshop code" });
      }

      // Fetch both course and unit information in a single SQL query
      const query = `
DECLARE @CourseID INT;
DECLARE @UnitStandardIDs NVARCHAR(MAX);

-- Step 1: Get the CourseID and UnitStandardIDs from the workshop
SELECT TOP 1 
    @CourseID = w.CourseID, 
    @UnitStandardIDs = w.UnitStandardIDs
FROM tblWorkshop w
WHERE w.Code = @Code;

SELECT 
    c.CourseID, 
    c.CourseName
FROM tblCourse c
WHERE c.CourseID = @CourseID

-- Step 2: Combine assigned unit standards and additional ones
-- Assigned unit standards
SELECT 
    c.CourseID, 
    c.CourseName, 
    us.USName, 
    us.UnitStandardID, 
    us.US AS UnitStandard
FROM tblCourse c
JOIN tblCourseUnitStandard cus ON c.CourseID = cus.CourseID
JOIN tblUnitStandard us ON cus.UnitStandardID = us.UnitStandardID
WHERE c.CourseID = @CourseID

UNION

-- Additional unit standards from UnitStandardIDs column in workshop
SELECT 
    c.CourseID, 
    c.CourseName, 
    us.USName, 
    us.UnitStandardID, 
    us.US AS UnitStandard
FROM tblCourse c
JOIN tblUnitStandard us 
    ON us.UnitStandardID IN (
        SELECT TRY_CAST(value AS INT) 
        FROM STRING_SPLIT(@UnitStandardIDs, ',')
    )
WHERE c.CourseID = @CourseID
/*
      SELECT c.CourseID, c.CourseName, us.USName, us.UnitStandardID, us.US UnitStandard
      FROM tblWorkshop w
      JOIN tblCourse c ON w.CourseID = c.CourseID
      LEFT JOIN tblCourseUnitStandard cus ON c.CourseID = cus.CourseID
      LEFT JOIN tblUnitStandard us ON cus.UnitStandardID = us.UnitStandardID
      WHERE w.Code = @Code*/
    `;

      request.input("Code", sql.VarChar, Code);

      request.query(query, (err, result) => {
        if (err) {
          console.log(err);
          return res.send({ code: 500, message: "Error fetching data" });
        }

        if (!result.recordset.length) {
          return res.send({ code: 0, data: {} });
        }

        // Get course information
        const courseData = {
          CourseID: result.recordsets[0][0].CourseID,
          CourseName: result.recordsets[0][0].CourseName,
        };

        // Extract unit information, filtering out records without unit data
        const units = result.recordsets[1]
          .filter((row) => row.USName) // Filter out records without unit information
          .map((row) => ({
            USName: row.USName,
            UnitStandardID: row.UnitStandardID,
            UnitStandard: row.UnitStandard,
          }));

        return res.send({
          code: 0,
          data: {
            course: courseData,
            units: units,
          },
        });
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post("/workshop/submit-result", isAuthenticated, async function (req, res, next) {
    try {
      const pool = await getPool();
      const request = await pool.request();

      // Extracting the parameters from the request body
      const { StudentID, Result } = req.body;


      const { Course } = Result;

      // Check if both parameters are provided
      if (!StudentID || !Result) {
        return res.send({
          code: 400,
          message: "Missing WorkshopResultID or result",
        });
      }

      // Convert result object to JSON string for storage in the database
      const resultJson = JSON.stringify(Result);

      // SQL query to update the Result column in tblStudentInfo
      const query = `
      UPDATE tblStudentInfo
      SET Result = @Result, CourseStatus = @CourseStatus
      WHERE StudentID = @StudentID
    `;

      request.input("StudentID", sql.Int, StudentID);
      request.input("Result", sql.VarChar(sql.MAX), resultJson);
      request.input("CourseStatus", sql.VarChar(sql.MAX), Course);

      request.query(query, (err, result) => {
        if (err) {
          console.log(err);
          return res.send({ code: 500, message: "Error updating result" });
        }

        if (result.rowsAffected[0] === 0) {
          return res.send({ code: 404, message: "Student not found" });
        }

        return res.send({
          code: 0,
          data: true,
          message: "Result updated successfully",
        });
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post("/workshop/submitAllresult", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();
    // Extracting the parameters from the request body
    const { Code, Result } = req.body;
    const { Course } = Result;
    // Check if both parameters are provided
    if (!Code || !Result) {
      return res.send({
        code: 400,
        message: "Missing Code or result",
      });
    }

    // Convert result object to JSON string for storage in the database
    const resultJson = JSON.stringify(Result);

    // SQL query to update the Result column in tblStudentInfo
    const query = `
    UPDATE tblStudentInfo
    SET Result = @Result, CourseStatus = @CourseStatus
    WHERE Code = @Code
  `;

    request.input("Code", sql.VarChar(sql.MAX), Code);
    request.input("Result", sql.VarChar(sql.MAX), resultJson);
    request.input("CourseStatus", sql.VarChar(sql.MAX), Course);

    request.query(query, (err, result) => {
      if (err) {
        console.log(err);
        return res.send({ code: 500, message: "Error updating result" });
      }

      if (result.rowsAffected[0] === 0) {
        return res.send({ code: 404, message: "Code not found" });
      }

      return res.send({
        code: 0,
        data: true,
        message: "Result updated successfully",
      });
    });
  } catch (error) {
    next(error);
  }
}
);



router.post("/workshop/assessAllresult", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();
    // Extracting the parameters from the request body
    const { Code, Result, AdditionalUnits } = req.body;
    const { Course } = Result;
    console.log( "Code");
    console.log(Code);
    // Check if both parameters are provided
    if (!Code || !Result) {
      return res.send({
        code: 400,
        message: "Missing Code or result",
      });
    }

    // Convert result object to JSON string for storage in the database
    // const resultJson = JSON.stringify(Result);

    let unitStandQuery = "";

    const allKeys = Object.keys(Result).filter(key => key !== "id" && key !== "Note" && key !== "CourseStatus" && key !== "CourseID" && key !== "Course");
    allKeys.forEach(key => {
      unitStandQuery += `
      UPDATE tblStudentInCourseUnitStandard  SET UnitStatus = '${Result[key]}'  WHERE UnitStandardID = ${key} AND SICId  IN ( SELECT id FROM tblStudentInCourse WHERE  Code = @Code);
      `;
    });

    // SQL query to update the Result column in tblStudentInfo
    const query = `
    BEGIN TRANSACTION
      -- Step 1: Update course status first
      UPDATE tblStudentInCourse SET CourseStatus = @CourseStatus WHERE Code = @Code;

      -- Step 2: Update all unit standards with their assessment status (including additional units)
      ${unitStandQuery}

      -- Step 3: Handle additional units - first ensure Code column is set for all records
      UPDATE tblStudentInCourseUnitStandard
      SET Code = CINS.Code
      FROM tblStudentInCourseUnitStandard USIC
      INNER JOIN tblStudentInCourse CINS ON USIC.SICId = CINS.id
      WHERE CINS.Code = @Code AND USIC.Code IS NULL;

      -- Step 4: Delete only additional units that are no longer in the new AdditionalUnits list
      IF(ISNULL(@AdditionalUnits, '') <> '')
      BEGIN
        DELETE FROM tblStudentInCourseUnitStandard
        WHERE Code = @Code
          AND IsAditional = 1
          AND UnitStandardID NOT IN (SELECT CAST(value AS INT) FROM STRING_SPLIT(@AdditionalUnits, ','));
      END
      ELSE
      BEGIN
        -- If no additional units specified, delete all additional units
        DELETE FROM tblStudentInCourseUnitStandard WHERE Code = @Code AND IsAditional = 1;
      END

      -- Step 5: Insert new additional units that don't already exist
      IF(ISNULL(@AdditionalUnits, '') <> '')
      BEGIN
        INSERT INTO tblStudentInCourseUnitStandard
        (SICId, StudentID, CourseID, UnitStandardID, IsAditional, Code, IsActive, CreatDate, LastModifyDate)
        SELECT CINS.id SICId, S.StudentID, CINS.CourseID, CAST(value AS INT) AS Unit, 1 IsAditional, CINS.Code, 1 IsActive, GETDATE(), GETDATE()
        FROM tblStudentInCourse CINS
        INNER JOIN tblCourse C ON CINS.CourseID = C.CourseID
        INNER JOIN tblStudentInfo S ON CINS.StudentID = S.StudentID
        CROSS APPLY STRING_SPLIT(@AdditionalUnits, ',')
        WHERE CINS.Code = @Code
          AND (S.IsDeleted IS NULL OR S.IsDeleted = 0)
          AND NOT EXISTS (
            SELECT 1
            FROM tblStudentInCourseUnitStandard E
            WHERE E.SICId = CINS.id
              AND E.UnitStandardID = CAST(value AS INT)
          );
      END

      -- Step 6: Insert additional units from workshop UnitStandardIDs if they don't exist
      INSERT INTO tblStudentInCourseUnitStandard (SICId, StudentID, CourseID, UnitStandardID, IsAditional, Code, IsActive, CreatDate, LastModifyDate)
      SELECT CINS.id AS SICId, S.StudentID, CINS.CourseID, CAST(wu.value AS INT) AS UnitStandardID, 1 AS IsAditional, CINS.Code, 1 AS IsActive, GETDATE(), GETDATE()
      FROM tblStudentInCourse CINS
      INNER JOIN tblCourse C ON CINS.CourseID = C.CourseID
      INNER JOIN tblStudentInfo S ON CINS.StudentID = S.StudentID
      INNER JOIN tblWorkshop W ON W.Code = @Code
      CROSS APPLY STRING_SPLIT(W.UnitStandardIDs, ',') wu
      WHERE CINS.Code = @Code
        AND (S.IsDeleted IS NULL OR S.IsDeleted = 0)
        AND ISNULL(W.UnitStandardIDs, '') <> ''
        AND NOT EXISTS (
          SELECT 1
          FROM tblStudentInCourseUnitStandard E
          WHERE E.SICId = CINS.id
            AND E.UnitStandardID = CAST(wu.value AS INT)
        );

      IF(@@ERROR > 0)
      BEGIN
        ROLLBACK;
      END
      ELSE
      BEGIN
        COMMIT;
      END
  `;

    request.input("Code", sql.VarChar(sql.MAX), Code);
    request.input("CourseStatus", sql.VarChar(sql.MAX), Course);
    request.input("AdditionalUnits", sql.VarChar(sql.MAX), AdditionalUnits);
    console.log(query);
    request.query(query, (err, result) => {
      if (err) {
        console.log(err);
        return res.send({ code: 500, message: "Error updating result" });
      }
      console.log("result.rowsAffected");
      console.log(result.rowsAffected);
      console.log(result);

      return res.send({
        code: 0,
        data: true,
        message: "Result updated successfully",
      });
    });
  } catch (error) {
    next(error);
  }
}
);


router.post("/addTeacher", isAuthenticated, async (req, res, next) => {
  const {
    DeliverySpecialist,
    MarkAsDefault,
    UserId,
  } = req.body;
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const request = new sql.Request(transaction);
    let query = `
      IF(@MarkAsDefault = 1)
      BEGIN
        UPDATE tblDeliverySpecialist SET MarkAsDefault = 0;
      END;

    INSERT INTO [dbo].[tblDeliverySpecialist]
           (DeliverySpecialist, MarkAsDefault, UserId)
     VALUES
           (@DeliverySpecialist, @MarkAsDefault, @UserId)
    `;
    request.input("DeliverySpecialist", sql.VarChar, DeliverySpecialist);
    request.input("MarkAsDefault", sql.Bit, MarkAsDefault);
    request.input("UserId", sql.Int, UserId);

    await request.query(query);
    await transaction.commit();
    res.send({ code: 0, data: true, message: "Teacher created successfully" });

  } catch (error) {
    await transaction.rollback();
    next(error);
  }
});


router.put("/updateTeacher", isAuthenticated, async (req, res, next) => {
  const {
    Id,
    DeliverySpecialist,
    MarkAsDefault,
    UserId,
  } = req.body;
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const request = new sql.Request(transaction);
    let query = `
      IF(@MarkAsDefault = 1)
      BEGIN
        UPDATE tblDeliverySpecialist SET MarkAsDefault = 0;
      END;

      UPDATE tblDeliverySpecialist
      SET DeliverySpecialist = @DeliverySpecialist, MarkAsDefault = @MarkAsDefault, UserId = @UserId
      WHERE Id = @Id;
    `;
    request.input("Id", sql.Int, Id);
    request.input("DeliverySpecialist", sql.VarChar, DeliverySpecialist);
    request.input("MarkAsDefault", sql.Bit, MarkAsDefault);
    request.input("UserId", sql.Int, UserId);
    await request.query(query);
    await transaction.commit();
    res.send({ code: 0, data: "true", message: "Teacher updated successfully" });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
});



router.post("/deleteTeacher", isAuthenticated, async (req, res, next) => {
  const {id,} = req.body;
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const request = new sql.Request(transaction);
    let query = `    
        DELETE FROM tblDeliverySpecialist WHERE Id = @id;
    `;
    request.input("id", sql.Int, id);

    await request.query(query);
    await transaction.commit();
    res.send({ code: 0, data: true, message: "Teacher created successfully" });

  } catch (error) {
    await transaction.rollback();
    next(error);
  }
});

module.exports = router;
