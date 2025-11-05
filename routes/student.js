const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const router = express.Router();
const isAuthenticated = require("./auth");
const { getPagination, getPool } = require("./utils");
const { email, SendTemplateEmail } = require("./email/send");
const axios = require("axios");
const sql = require("mssql");
const logger = require("../logger");

// Use environment variables for sensitive credentials
const sendMailUrl = `https://graph.microsoft.com/v1.0/users/${process.env.EMAIL_SENDER}/sendMail`;
const clientId = process.env.AZURE_CLIENT_ID;
const clientSecret = process.env.AZURE_CLIENT_SECRET;

async function getToken() {
  const tokenUrl = `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`;

  const params = {
    client_id: clientId,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
    client_secret: clientSecret,
  };

  try {
    const response = await axios.post(tokenUrl, new URLSearchParams(params));
    return response.data.access_token;
  } catch (error) {
    console.error("Error getting tokens:", error);
    throw error;
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, "uploadDoc");
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath);
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    console.log("req.FileSaveName", req.FileSaveName);
    console.log("req.userId", req.userId);
    const customName = req.body.FileSaveName || `${Date.now()}-${file.originalname}`;
    cb(null, customName);
  }
});

const upload = multer({ storage });

router.post("/uploaddoc", upload.single("file"), async (req, res) => {
  try {
    const {
      StudentID,
      FileName,
      ImageList
    } = req.body;
    if (!StudentID) {
      return res.send({ code: 400, message: "StudentID is required" });
    }

    var FileSaveName = req.file.filename;

    const pool = await getPool();
    const request = await pool.request();
    request.input("StudentID", sql.Int, StudentID);
    var imgList = JSON.parse(ImageList);
    imgList.push({ "FileSaveName": FileSaveName, "FileName": FileName });
    request.input("AdditionalDocuments", sql.VarChar, JSON.stringify(imgList));
    const query = `
      UPDATE tblStudentInfo
      SET AdditionalDocuments = @AdditionalDocuments
      WHERE StudentID = @StudentID;
    `;

    await request.query(query);
    return res.send({ code: 0, data: "success", message: "File uploaded successfully" });
  } catch (error) {

    return res.send({ code: 404, message: "File uploaded faild" });
  }
});

router.get("/list", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();

    const current = Number(req.query.current || 1);
    const pageSize = Number(req.query.pageSize || 10);
    const startIndex = (current - 1) * pageSize;
    const name = req.query.name || "";
    const School = req.query.School || "";
    const AssignedTo = req.query.AssignedTo || "";
    const LearnerStatus = req.query.LearnerStatus || "";
    const FollowUp = req.query.FollowUp || "";
    const Tutor = req.query.Tutor || "";


    request.input("name", sql.VarChar, name);
    request.input("School", sql.VarChar, School);
    request.input("AssignedTo", sql.VarChar, AssignedTo);
    request.input("Status", sql.VarChar, LearnerStatus);
    request.input("startIndex", sql.Int, startIndex);
    request.input("FollowUp", sql.VarChar, FollowUp);
    request.input("Tutor", sql.VarChar, Tutor);
    request.input("pageSize", sql.Int, pageSize);


    const query = `
    WITH FilteredStudents AS (
      SELECT *,
        IIF(LEN(Code) > 0, 'WorkShop', 'Remote') AS LearnerType,
        ROW_NUMBER() OVER (ORDER BY FirstName, LastName) AS RowNum
      FROM tblStudentInfo s
      WHERE (s.FirstName LIKE '' + @name + '%'
        OR s.LastName LIKE '' + @name + '%')
        AND  (ISNULL(@School, '') = '' OR s.School LIKE '%' + @School + '%')
        AND  (ISNULL(@AssignedTo, '') = '' OR s.AssignedTo = @AssignedTo)
        AND  (ISNULL(@Status, '') = '' OR s.Status = @Status)
        AND  (ISNULL(@Tutor, '') = '' OR s.Tutor = @Tutor)
        AND ((ISNULL(@FollowUp, '') = '') OR ((ISNULL(LastCommunicateDate, '') = '' OR DATEDIFF(DAY, LastCommunicateDate, GETDATE()) > 30) AND ISNULL(s.Status, 'On Going') = 'On Going'))
        AND (s.IsDeleted IS NULL OR s.IsDeleted = 0)
    )
    SELECT COUNT(*) AS totalRows
    FROM FilteredStudents;

    WITH FilteredStudents AS (
      SELECT *,
        IIF(LEN(Code) > 0, 'WorkShop', 'Remote') AS LearnerType,
        ROW_NUMBER() OVER (ORDER BY FirstName, LastName) AS RowNum
      FROM tblStudentInfo s
      WHERE (s.FirstName LIKE '' + @name + '%'
        OR s.LastName LIKE '' + @name + '%')
        AND  (ISNULL(@School, '') = '' OR s.School LIKE '%' + @School + '%')
        AND  (ISNULL(@AssignedTo, '') = '' OR s.AssignedTo = @AssignedTo)
        AND  (ISNULL(@Status, '') = '' OR s.Status = @Status)
        AND  (ISNULL(@Tutor, '') = '' OR s.Tutor = @Tutor)
        AND ((ISNULL(@FollowUp, '') = '') OR ((ISNULL(LastCommunicateDate, '') = '' OR DATEDIFF(DAY, LastCommunicateDate, GETDATE()) > 30) AND ISNULL(s.Status, 'On Going') = 'On Going'))
        AND (s.IsDeleted IS NULL OR s.IsDeleted = 0)
    )
    SELECT *
    FROM FilteredStudents
    WHERE RowNum BETWEEN @startIndex + 1 AND @startIndex + @pageSize
    ORDER BY FirstName, LastName;
  `;

    // Log SQL query with parameters
    const queryStart = Date.now();
    logger.debug(`SQL Query - Student List`, {
      params: { name, School, AssignedTo, Status: LearnerStatus, FollowUp, Tutor, pageSize, current },
      filters: Object.entries({ name, School, AssignedTo, Status: LearnerStatus, FollowUp, Tutor })
        .filter(([_, v]) => v)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ') || 'None'
    });

    request.query(query, (err, result) => {
      const queryDuration = Date.now() - queryStart;

      if (queryDuration > 3000) {
        logger.warn(`Slow SQL Query - Student List took ${queryDuration}ms with filters: ${Object.entries({ name, School, AssignedTo, Status: LearnerStatus, FollowUp, Tutor })
          .filter(([_, v]) => v)
          .map(([k, v]) => `${k}=${v}`)
          .join(', ')}`);
      }
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


router.post("/deletefile", isAuthenticated, async function (req, res, next) {
  try {
    const { StudentID, fileName, ImageList } = req.body;
    if (!StudentID) {
      return res.send({ code: 400, message: "EnrollmentID is required" });
    }
    if (!StudentID) {
      return res.send({ code: 400, message: "File Name is required" });
    }

    const filePath = path.join(__dirname, "uploadDoc", fileName);

    fs.access(filePath, fs.constants.F_OK, async (err) => {
      if (err) {
        return res.status(404).send({ message: "File not found" });
      }
      const pool = await getPool();
      const request = await pool.request();
      var imgList = JSON.parse(ImageList);
      request.input("StudentID", sql.Int, StudentID);
      request.input("AdditionalDocuments", sql.VarChar, JSON.stringify(imgList));
      const query = `
        UPDATE tblStudentInfo
        SET AdditionalDocuments = @AdditionalDocuments
        WHERE StudentID = @StudentID;
      `;
      await request.query(query);
      fs.unlink(filePath, (err) => {
        if (err) {
          console.log("name 07");
          return res.send({ message: "Failed to delete file" });
        }

        console.log("name 09");
        return res.send({ code: 0, data: "success", message: `${fileName} delete successfully` });
      });
    });

  } catch (error) {
    next(error);
  }
});


// router.post("/deletefile", isAuthenticated, async function (req, res, next) {
//   try {
//     const {EnrollmentID, fileName, ImageList} = req.body;
//     console.log("name", req.body);
//     const filePath = path.join(__dirname, "uploadDoc", fileName);

//     fs.access(filePath, fs.constants.F_OK, async (err) => {
//       if (err) {
//         return res.status(404).send({ message: "File not found" });
//       }

//       const pool = await getPool();
//       const request = await pool.request();
//       request.input("StudentID", sql.Int, StudentID);
//       request.input("AdditionalDocuments", sql.VarChar, JSON.stringify(ImageList));
//       const query = `
//         UPDATE enrollment
//         SET AdditionalDocuments = @AdditionalDocuments
//         WHERE StudentID = @StudentID;
//       `;

//       await request.query(query);

//       fs.unlink(filePath, (err) => {
//         if (err) {
//           return res.status(500).send({ message: "Failed to delete file" });
//         }
//         res.status(200).send({ message: `${fileName} delete successfully` })
//       });
//     });

//   } catch (error) {
//     next(error);
//   }
// });


router.get("/image-list", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();
    //   if (!req?.admin)  {
    //   return res.send({ code: 403, data: [], message: "no permission" });
    // }
    const current = Number(req.query.current || 1);
    const pageSize = Number(req.query.pageSize || 10);
    const total = Number(req.query.pageSize || 10);
    const StudentID = Number(req.query.StudentID || 0);

    request.input("StudentID", sql.Int, StudentID);

    const query = `SELECT * FROM  tblStudentInfo WHERE StudentID = @StudentID; `;

    request.query(query, (err, result) => {
      if (err) console.log(err);
      if (result?.recordset) {
        const currentPageData = result.recordsets[0];
        return res.send({
          code: 0,
          data: currentPageData,
          pagination: getPagination(current, pageSize, total),
        });
      }

      return res.send({ code: 0, data: [], pagination: null });
    });
  } catch (error) {
    next(error);
  }
});


router.get("/results", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();
    //   if (!req?.admin)  {
    //   return res.send({ code: 403, data: [], message: "no permission" });
    // }
    const current = Number(req.query.current || 1);
    const pageSize = Number(req.query.pageSize || 10);
    const startIndex = (current - 1) * pageSize;
    const firstName = req.query.FirstName || "";
    const lastName = req.query.LastName || "";

    request.input("firstName", sql.VarChar, firstName);
    request.input("lastName", sql.VarChar, lastName);
    request.input("startIndex", sql.Int, startIndex);
    request.input("pageSize", sql.Int, pageSize);

    const query = `

    WITH FilteredResults AS (
      SELECT * 
      FROM (
        SELECT s.Email, s.FirstName, s.LastName, s.DateOfBirth DOB, s.Gender, s.Ethnicity, s.Status CourseStatus, [HospitalityCourses], [WorklifeCourses], [FarmingUnits], 1 IsRemote, '' Result, '' CourseName
        FROM [dbo].[tblStudentInfo] s 
        WHERE  (s.IsDeleted IS NULL OR s.IsDeleted = 0)
      ) x
      WHERE x.FirstName = @firstName And x.LastName = @lastName
    )
    
        SELECT COUNT(*) AS totalRows
        FROM FilteredResults;
  
      
        WITH FilteredResultPaged AS (
        SELECT *, ROW_NUMBER() OVER (ORDER BY FirstName, LastName) AS RowNum
          FROM (
        SELECT s.Email, s.FirstName, s.LastName, s.DateOfBirth DOB, s.Gender, s.Ethnicity, 'Remote' LearnType, COALESCE(NULLIF(s.Status, ''), 'On Going') CourseStatus, [HospitalityCourses], [WorklifeCourses], [FarmingUnits], 1 IsRemote, '' Result, CourseName
        FROM [dbo].[tblStudentInfo] s 
        WHERE  (s.IsDeleted IS NULL OR s.IsDeleted = 0)
      ) x
      WHERE x.FirstName = @firstName And x.LastName = @lastName
        )
      
        SELECT *
        FROM FilteredResultPaged
        WHERE RowNum BETWEEN @startIndex + 1 AND @startIndex + @pageSize
        ORDER BY FirstName, LastName;
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
});

router.post("/update", isAuthenticated, async function (req, res, next) {
  try {
    const {
      StudentID,
      FirstName,
      LastName,
      School,
      Gender,
      DateOfBirth,
      Ethnicity,
      Email,
      Status,
      PhoneNumber,
      Fees,
      WorkbookOption,
      TeacherEmail,
      StreetAddress,
      City,
      Region,
      Zipcode,
      AdditionalInfo,
      InvoiceEmail,
      TutorId,
      CourseID,
      CourseName,
      FarmingUnits,
      HospitalityCourses,
      WorklifeCourses,
      HospitalityCourseID,
      WorklifeCoursesID,
      FarmingUnitID,
      InternalNote,
      NZQAInfo,
      TeacherName,
      AssignedTo,
      type,
      NSN,

    } = req.body;
    if (!StudentID) {
      return res.send({ code: 400, message: "EnrollmentID is required" });
    }

    const pool = await getPool();
    const request = await pool.request();
    request.input("StudentID", sql.Int, StudentID);
    request.input("FirstName", sql.VarChar, FirstName || "");
    request.input("LastName", sql.VarChar, LastName || "");
    request.input("School", sql.VarChar, School || "");
    request.input("Gender", sql.VarChar, Gender || "");
    request.input("DateOfBirth", sql.VarChar, DateOfBirth || "");
    request.input("Ethnicity", sql.VarChar, Ethnicity || "");
    request.input("PhoneNumber", sql.VarChar, PhoneNumber || "");
    request.input("Email", sql.VarChar, Email || "");
    request.input("Status", sql.VarChar, Status || "");
    request.input("Fees", sql.VarChar, Fees || "");
    request.input("WorkbookOption", sql.VarChar, WorkbookOption || "");
    request.input("TeacherEmail", sql.VarChar, TeacherEmail || "");
    request.input("StreetAddress", sql.VarChar, StreetAddress || "");
    request.input("City", sql.VarChar, City || "");
    request.input("Region", sql.VarChar, Region || "");
    request.input("Zipcode", sql.VarChar, Zipcode || "");
    request.input("AdditionalInfo", sql.VarChar, AdditionalInfo || "");
    request.input("InvoiceEmail", sql.VarChar, InvoiceEmail || "");
    request.input("TutorId", sql.Int, TutorId || 0);
    request.input("CourseID", sql.Int, CourseID || "");
    request.input("CourseName", sql.VarChar, CourseName || "");
    request.input("FarmingUnits", sql.VarChar, FarmingUnits || "");
    request.input("HospitalityCourses", sql.VarChar, HospitalityCourses || "");
    request.input("WorklifeCourses", sql.VarChar, WorklifeCourses || "");
    request.input("HospitalityCourseID", sql.Int, (parseInt(HospitalityCourseID) > 0 ? HospitalityCourseID : null) || null);
    request.input("WorklifeCoursesID", sql.Int, (parseInt(WorklifeCoursesID) > 0 ? WorklifeCoursesID : null) || null);
    request.input("FarmingUnitID", sql.Int, (parseInt(FarmingUnitID) > 0 ? FarmingUnitID : null) || null);
    request.input("InternalNote", sql.VarChar, InternalNote || "");
    request.input("NZQAInfo", sql.VarChar, NZQAInfo || "");
    request.input("TeacherName", sql.VarChar, TeacherName || "");
    request.input("AssignedTo", sql.VarChar, AssignedTo || "");
    request.input("nsn", sql.VarChar, NSN || "");

    let updateStatement = "";
    console.log("type");
    console.log(type);
    if (type == 1) {
      updateStatement = ` SET FirstName = @FirstName,
          LastName = @LastName,
          Gender = @Gender,
          DateOfBirth = @DateOfBirth,
          Ethnicity = @Ethnicity,
          PhoneNumber = @PhoneNumber,
          Email = @Email,
          Status = @Status,
          StreetAddress = @StreetAddress,
          City = @City,
          Region = @Region,
          NSN = @nsn,
          Zipcode = @Zipcode`;
    }

    if (type == 2) {
      updateStatement = ` SET 
      School = @School,
      Tutor = @Tutor,
      TutorId = @TutorId,
      TeacherEmail = @TeacherEmail,
      InvoiceEmail = @InvoiceEmail,
      NZQAInfo = @NZQAInfo,
      AssignedTo = @AssignedTo
      `;
    }

    if (type == 3) {
      updateStatement = ` SET 
      WorkbookOption = @WorkbookOption,
      Fees = @Fees,
      AdditionalInfo = @AdditionalInfo,
      InternalNote  = @InternalNote
      `;
    }



    const query = `
    DECLARE @Tutor NVARCHAR(MAX) = NULL;
    IF(@TutorId > 0)
    BEGIN
      SELECT TOP(1) @Tutor = DeliverySpecialist FROM   tblDeliverySpecialist WHERE Id = @TutorId;
    END

      UPDATE tblStudentInfo
      ${updateStatement}
      WHERE StudentID = @StudentID;
    `;
    /*
    SET FirstName = @FirstName,
        LastName = @LastName,
        School = @School,
        Gender = @Gender,
        DateOfBirth = @DateOfBirth,
        Ethnicity = @Ethnicity,
        PhoneNumber = @PhoneNumber,
        Email = @Email,
        Status = @Status,
        Fees = @Fees,
        WorkbookOption = @WorkbookOption,
        TeacherEmail = @TeacherEmail,
        StreetAddress = @StreetAddress,
        City = @City,
        Region = @Region,
        Zipcode = @Zipcode,
        AdditionalInfo = @AdditionalInfo,
        InvoiceEmail = @InvoiceEmail,
        Tutor = @Tutor,
        TutorId = @TutorId,
        CourseID = @CourseID,
        CourseName = @CourseName,
        FarmingUnits = @FarmingUnits,
        HospitalityCourses = @HospitalityCourses,
        WorklifeCourses = @WorklifeCourses,          
        HospitalityCourseID = @HospitalityCourseID,
        WorklifeCoursesID = @WorklifeCoursesID,
        FarmingUnitID = @FarmingUnitID,
        InternalNote  = @InternalNote,
        TeacherName = @TeacherName,
        NZQAInfo = @NZQAInfo,
        AssignedTo = @AssignedTo*/

    await request.query(query);
    return res.send({ code: 0, data: "success", message: "Update successful" });
  } catch (error) {
    next(error);
  }
});


router.post("/delete", isAuthenticated, async function (req, res, next) {
  try {
    const { StudentID } = req.body;
    if (!StudentID) {
      return res.send({ code: 400, message: "StudentID is required" });
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
    return res.send({ code: 0, data: "success", message: "Delete successful" });
  } catch (error) {
    next(error);
  }
});

router.get("/course", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();

    const id = Number(req.query.id);

    if (!id) {
      return res.send({ code: 0, data: [] });
    }
    request.input("id", sql.Int, id);

    const query = `
    SELECT DISTINCT sc.*, 
    c.CourseName,
    scu.StudentCourseUnitStandardID,   scu.UnitStandardID, 
    us.US,	us.USName,	us.USLevel,	us.USCredits,	us.USDescription
   FROM tblStudentCourse sc
   LEFT OUTER JOIN tblCourse c ON c.CourseID = sc.CourseID
   JOIN tblStudentCourseUnitStandard scu ON sc.StudentCourseID = scu.StudentCourseID
   LEFT OUTER JOIN tblUnitStandard us ON scu.UnitStandardID = us.UnitStandardID
   WHERE sc.StudentID = @id
`;

    request.query(query, (err, result) => {
      if (err) console.log(err);
      if (result?.recordset) {
        const currentPageData = result.recordsets[0];
        return res.send({
          code: 0,
          data: currentPageData || [],
        });
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post("/assigned", isAuthenticated, async function (req, res, next) {
  try {
    if (!req?.admin) {
      return res.send({ code: 403, message: "no permission" });
    }
    const pool = await getPool();
    const request = await pool.request();
    const id = Number(req.body.id);
    const tutor = req.body.tutor || "";
    if (!id || !tutor) {
      return res.send({ code: 1, message: "Please select" });
    }
    request.input("id", sql.Int, id);
    request.input("Tutor", sql.VarChar, tutor);
    const query = `
    UPDATE enrollment
    SET Tutor = @Tutor
    WHERE EnrollmentID = @id;
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
});

router.post("/assignedTeacher", isAuthenticated, async function (req, res, next) {
  try {
    if (!req?.admin) {
      return res.send({ code: 403, message: "no permission" });
    }
    const pool = await getPool();
    const request = await pool.request();
    const id = Number(req.body.id);
    const tutor = req.body.tutor || "";
    if (!id || !tutor) {
      return res.send({ code: 1, message: "Please select" });
    }
    request.input("id", sql.Int, id);
    request.input("Tutor", sql.Int, tutor);
    const query = `

    UPDATE [dbo].[tblStudentInfo]
    SET TutorId  = @Tutor, Tutor = (SELECT TOP 1 DeliverySpecialist  FROM tblDeliverySpecialist WHERE (Id = @Tutor))
    WHERE StudentID = @id;
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
});

router.post("/assigned/course", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();
    const id = Number(req.body.id);
    const CourseID = Number(req.body.CourseID);
    if (!id) {
      return res.send({ code: 1, message: "Please select" });
    }
    const CourseName = req.body.CourseName || "";
    request.input("id", sql.Int, id);
    request.input("CourseID", sql.Int, CourseID);
    request.input("CourseName", sql.VarChar, CourseName);
    const query = `
    UPDATE enrollment
    SET CourseID = @CourseID,
    CourseName = @CourseName
    WHERE EnrollmentID = @id;
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

router.get("/CourseUnits", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();
    const CourseID = req.query.CourseID;

    if (!CourseID) {
      return res.send({ code: 400, message: "Missing CourseID" });
    }

    // Fetch both course and unit information in a single SQL query
    const query = `
      SELECT c.CourseID, c.CourseName, us.USName, us.UnitStandardID
      FROM tblCourse c
      LEFT JOIN tblCourseUnitStandard cus ON c.CourseID = cus.CourseID
      LEFT JOIN tblUnitStandard us ON cus.UnitStandardID = us.UnitStandardID
      WHERE c.CourseID = @CourseID
    `;

    request.input("CourseID", sql.VarChar, CourseID);

    request.query(query, (err, result) => {
      if (err) {
        console.log(err);
        return res.send({ code: 500, message: "Error fetching data" });
      }

      if (!result.recordset.length) {
        return res.send({ code: 404, message: "No data found" });
      }

      // Get course information
      const courseData = {
        CourseID: result.recordset[0].CourseID,
        CourseName: result.recordset[0].CourseName,
      };

      // Extract unit information, filtering out records without unit data
      const units = result.recordset
        .filter((row) => row.USName) // Filter out records without unit information
        .map((row) => ({
          USName: row.USName,
          UnitStandardID: row.UnitStandardID,
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
});

router.post("/submit-result", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();

    // Extracting the parameters from the request body
    const { StudentID, Result } = req.body;

    // Check if both parameters are provided
    if (!StudentID || !Result) {
      return res.send({
        code: 400,
        message: "Missing EnrollmentID or result",
      });
    }

    // Convert result object to JSON string for storage in the database
    const resultJson = JSON.stringify(Result);

    // SQL query to update the Result column in tblStudentInfo
    const query = `
      UPDATE tblStudentInfo
      SET Result = @Result
      WHERE StudentID = @StudentID
    `;

    request.input("StudentID", sql.Int, EnrollmentID);
    request.input("Result", sql.VarChar(sql.MAX), resultJson);

    request.query(query, (err, result) => {
      if (err) {
        return res.send({ code: 500, message: "Error updating result" });
      }

      if (result.rowsAffected[0] === 0) {
        return res.send({ code: 404, message: "EnrollmentID not found" });
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
});

router.get("/allCourse", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();

    const id = Number(req.query.id);

    if (!id) {
      return res.send({ code: 0, data: [] });
    }

    request.input("id", sql.Int, id);

    const query = `
          SELECT SC.id As Id, SC.CourseID, SC.LearnerType, SC.StartDate, SC.EndDate, SC.Code, SC.CourseType, C.CourseName, SC.CourseStatus, SC.Note, SC.CertificateRequested, SC.CertificateRequestedDate
          FROM tblStudentInCourse SC
          INNER JOIN [dbo].[tblCourse] C ON SC.CourseID = C.CourseID 
          WHERE SC.StudentId = @id
          ORDER BY SC.id DESC
        `;

    request.query(query, (err, result) => {
      if (err) console.log(err);
      if (result?.recordset) {
        const currentPageData = result.recordsets[0];
        return res.send({
          code: 0,
          data: currentPageData || [],
        });
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post("/AddCourse", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();

    // Extracting the parameters from the request body
    const { id, StudentID, CourseType, CourseId, UnitStandards } = req.body;

    // Check if both parameters are provided
    if (!StudentID) {
      return res.send({
        code: 400,
        message: "Missing Student or Course",
      });
    }

    let UnitStandardQuery = "";
    if (CourseType == "Work & Life Skills") {
      UnitStandardQuery = `INSERT INTO tblStudentInCourseUnitStandard 
      (StudentID, SICId, CourseID, UnitStandardID, IsAditional, IsActive, CreatDate, LastModifyDate)
      SELECT @StudentID, @id, @CourseID, UnitStandardID, 0, 1, GETDATE(), GETDATE() FROM [dbo].[tblCourseUnitStandard] WHERE CourseID = @CourseID;`;
    }

    let selectCourse = "";
    if (CourseType == "Farming & Horticulture") {
      selectCourse = "SELECT TOP  1 @CourseID = CourseID FROM tblCourse WHERE CourseName = 'Farming & Horticulture'";
      UnitStandards.forEach(item => {
        UnitStandardQuery = UnitStandardQuery + `INSERT INTO tblStudentInCourseUnitStandard 
        (StudentID, SICId, CourseID, UnitStandardID, IsAditional, IsActive, CreatDate, LastModifyDate)
        VALUES (@StudentID, @id, @CourseID, ${item}, 0, 1, GETDATE(), GETDATE()); `;
      });
    }

    console.log("CourseType");
    console.log(CourseType);
    if (CourseType == "Custom") {
      //selectCourse = "SELECT TOP  1 @CourseID = CourseID FROM tblCourse WHERE CourseName = 'Farming & Horticulture'";
      UnitStandards.forEach(item => {
        UnitStandardQuery = UnitStandardQuery + `INSERT INTO tblStudentInCourseUnitStandard 
        (StudentID, SICId, CourseID, UnitStandardID, IsAditional, IsActive, CreatDate, LastModifyDate)
        VALUES (@StudentID, @id, @CourseID, ${item}, 0, 1, GETDATE(), GETDATE()); `;
      });
    }


    // SQL query to update the Result column in tblStudentInfo
    const query = `
    BEGIN TRANSACTION
    DECLARE @id INT = 0;
    ${selectCourse}
    IF(@id > 0)
    BEGIN
      UPDATE  tblStudentInCourse
      SET        CourseID = @CourseID, IsActive = 1, LearnerType = @LearnerType, CourseType = @CourseType, LastModifyDate = GETDATE()
      WHERE   (id = @id);
      DELETE FROM tblStudentInCourseUnitStandard WHERE (SICId = @id);
    END
    INSERT INTO tblStudentInCourse(StudentID, CourseID, IsActive, LearnerType, CourseType, CreatDate, LastModifyDate)
    VALUES   (@StudentID, @CourseID, 1, @LearnerType, @CourseType, GETDATE(), GETDATE()) SELECT @id = @@IDENTITY;
    ${UnitStandardQuery}
    IF(@@ERROR  > 0)
    BEGIN
      ROLLBACK;
    END
    BEGIN
      COMMIT;
    END
    `;

    request.input("StudentID", sql.Int, StudentID);
    request.input("CourseID", sql.Int, CourseId || 0);
    request.input("LearnerType", sql.VarChar(sql.MAX), "");
    request.input("CourseType", sql.VarChar(sql.MAX), CourseType || "");

    request.query(query, (err, result) => {
      if (err) {
        return res.send({ code: 500, message: "Error Course adding." });
      }

      if (result.rowsAffected[0] === 0) {
        return res.send({ code: 404, message: "Error Course adding" });
      }

      return res.send({
        code: 0,
        data: true,
        message: "Course added successfully.",
      });
    });
  } catch (error) {
    next(error);
  }
});

router.post("/UpdateCourse", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();

    // Extracting the parameters from the request body
    const { id, StudentID, CourseId, CourseType, UnitStandards } = req.body;

    // Check if both parameters are provided
    if (!id || !StudentID) {
      return res.send({
        code: 400,
        message: "Missing id or Student or Course",
      });
    }

    let UnitStandardQuery = "";
    if (CourseType == "Work & Life Skills") {
      UnitStandardQuery = `INSERT INTO tblStudentInCourseUnitStandard 
    (StudentID, SICId, CourseID, UnitStandardID, IsAditional, IsActive, CreatDate, LastModifyDate)
    SELECT @StudentID, @id, @CourseID, UnitStandardID, 0, 1, GETDATE(), GETDATE() FROM [dbo].[tblCourseUnitStandard] WHERE CourseID = @CourseID;`;
    }

    let selectCourse = "";
    if (CourseType == "Farming & Horticulture") {
      selectCourse = "SELECT TOP  1 @CourseID = CourseID FROM tblCourse WHERE CourseName = 'Farming & Horticulture'";
      UnitStandards.forEach(item => {
        UnitStandardQuery = UnitStandardQuery + `INSERT INTO tblStudentInCourseUnitStandard 
    (StudentID, SICId, CourseID, UnitStandardID, IsAditional, IsActive, CreatDate, LastModifyDate)
    VALUES (@StudentID, @id, @CourseID, ${item}, 0, 1, GETDATE(), GETDATE()); `;
      });
    }

    // SQL query to update the Result column in tblStudentInfo
    const query = `
    BEGIN TRANSACTION
    ${selectCourse}
      UPDATE  tblStudentInCourse
      SET        CourseID = @CourseID, IsActive = 1, LearnerType = @LearnerType, CourseType = @CourseType, LastModifyDate = GETDATE()
      WHERE   (id = @id);
      DELETE FROM tblStudentInCourseUnitStandard WHERE (SICId = @id);
      ${UnitStandardQuery}
      IF(@@ERROR  > 0)
      BEGIN
        ROLLBACK;
      END
      BEGIN
        COMMIT;
      END
    `;

    request.input("id", sql.Int, id || 0);
    request.input("StudentID", sql.Int, StudentID);
    request.input("CourseID", sql.Int, CourseId);
    request.input("LearnerType", sql.VarChar(sql.MAX), "");
    request.input("CourseType", sql.VarChar(sql.MAX), CourseType || "");

    request.query(query, (err, result) => {
      if (err) {
        return res.send({ code: 500, message: "Error Course Updating." });
      }

      if (result.rowsAffected[0] === 0) {
        return res.send({ code: 404, message: "Error Course Updating" });
      }

      return res.send({
        code: 0,
        data: true,
        message: "Course added successfully.",
      });
    });
  } catch (error) {
    next(error);
  }
});

router.post("/DeleteCourse", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();

    // Extracting the parameters from the request body
    const { id } = req.body;

    // Check if both parameters are provided
    if (!id || id < 1) {
      return res.send({
        code: 400,
        message: "Missing Course",
      });
    }

    // SQL query to update the Result column in tblStudentInfo
    const query = `
    BEGIN TRANSACTION
    tblStudentInCourse
      DELETE FROM tblStudentInCourse WHERE (id = @id);
      DELETE FROM tblStudentInCourseUnitStandard WHERE (SICId = @id);
      IF(@@ERROR  > 0)
      BEGIN
        ROLLBACK;
      END
      BEGIN
        COMMIT;
      END
    `;

    request.input("id", sql.Int, id || 0);

    request.query(query, (err, result) => {
      if (err) {
        return res.send({ code: 500, message: "Error Course Updating." });
      }

      if (result.rowsAffected[0] === 0) {
        return res.send({ code: 404, message: "Error Course Updating" });
      }

      return res.send({
        code: 0,
        data: true,
        message: "Course added successfully.",
      });
    });
  } catch (error) {
    next(error);
  }
});

router.post("/AddAssessResult", isAuthenticated, async function (req, res, next) {

  try {
    const pool = await getPool();
    const request = await pool.request();

    // Extracting the parameters from the request body
    const { id, Note, CourseStatus, CourseID, CourseName, StudentName } = req.body;
    var Result = req.body;
    // Check if both parameters are provided
    if (!id || !Result) {
      return res.send({
        code: 400,
        message: "Missing ID or result",
      });
    }

    const allKeys = Object.keys(req.body).filter(key => key !== "id" && key !== "CourseName" && key !== "StudentName" && key !== "Note" && key !== "CourseStatus" && key !== "CourseID");

    let unitStandQuery = "";
    var allUnitDelete = "";
    if (allKeys.length > 0) {
      allUnitDelete = `DELETE FROM tblStudentInCourseUnitStandard WHERE  (SICId = @id) AND UnitStandardID NOT IN (${allKeys.join(', ')})`
    }

    allKeys.forEach(key => {

      unitStandQuery += `IF EXISTS (SELECT 1 FROM tblStudentInCourseUnitStandard  WHERE SICId = @id AND UnitStandardID = ${key})
                        BEGIN
                          UPDATE tblStudentInCourseUnitStandard  SET UnitStatus = '${Result[key]}'  WHERE SICId = @id AND UnitStandardID = ${key};
                        END
                        ELSE
                        BEGIN
                          INSERT INTO tblStudentInCourseUnitStandard (SICId, StudentID, CourseID, UnitStandardID, UnitStatus, IsAditional, IsActive, CreatDate, LastModifyDate) 
                          VALUES (@id, @StudentID, @CourseID, ${key}, '${Result[key]}', 1, 1, GETDATE(), GETDATE());
                        END `;

    });

    // SQL query to update the Result column in tblStudentInfo
    const query = `
      DECLARE @StudentID INT  = 0
      DECLARE @CourseID INT  = 0
      BEGIN TRANSACTION
      SELECT TOP 1 @StudentID =  StudentID, @CourseID = CourseID FROM tblStudentInCourse WHERE (id = @id);
      UPDATE tblStudentInCourse SET  CourseStatus = @CourseStatus , Note = @Note WHERE (id = @id);
      ${allUnitDelete}
      ${unitStandQuery}
      IF(@@ERROR > 0)
      BEGIN
        ROLLBACK;
      END
      BEGIN
        COMMIT;
      END
    `;

    request.input("id", sql.Int, id);
    request.input("CourseStatus", sql.VarChar(sql.MAX), CourseStatus || "");
    request.input("Note", sql.VarChar(sql.MAX), Note || "");
    request.query(query, (err, result) => {
      if (err) {
        return res.send({ code: 500, message: "Error updating result" });
      }

      if (result.rowsAffected[0] === 0) {
        return res.send({ code: 404, message: "EnrollmentID not found" });
      }
      
      const now = new Date();
      const CompletionDate = now.toISOString().split('T')[0];
      /*SendTemplateEmail("E0003", `Certificate Completion`, {CourseName, StudentName, CompletionDate});*/
      checkMicrocredentialEligibility(id, CourseName, StudentName);
      return res.send({
        code: 0,
        data: true,
        message: "Result updated successfully",
      });
    });

  } catch (error) {
    next(error);
  }
});

async function checkMicrocredentialEligibility(id, CourseName, StudentName){
  try {
    const pool = await getPool();
    const request = await pool.request();

    console.log('CheckMirco - 02');
    if (!id) {
      return res.send({ code: 0, data: [] });
    }

    console.log('CheckMirco - 03');
    request.input("id", sql.Int, id);

    console.log('CheckMirco - 04');
    const query = `
      DECLARE @StudentID INT  = 0;
      DECLARE @CourseID INT  = 0;
      DECLARE @CourseCount INT = 0;
      DECLARE @GroupID INT = 0;
      DECLARE @CompleteCount INT = 0;

      SELECT TOP 1 @StudentID =  StudentID, @CourseID = CourseID FROM tblStudentInCourse WHERE (id = @id);

      SELECT TOP 1 @GroupID = GroupId  FROM [dbo].[tblMicroCredentialEligibility]  WHERE CourseId = @CourseID;

      SELECT @CourseCount = COUNT(*) FROM [dbo].[tblMicroCredentialEligibility] WHERE GroupId = @GroupID;


      SELECT @CompleteCount = COUNT(*) FROM [dbo].[tblStudentInCourse]
      WHERE CourseID IN (SELECT CourseID FROM [dbo].[tblMicroCredentialEligibility]
      WHERE GroupId = (SELECT TOP 1 GroupId FROM [dbo].[tblMicroCredentialEligibility] WHERE CourseId = @CourseID))
      AND (ISNULL(CourseStatus, '') <> '' AND CourseStatus <> 'Not Yet Achieved');
      SELECT CASE WHEN (@CourseCount > 0 AND @CompleteCount > 0 AND  @CourseCount <= @CompleteCount) THEN 1  ELSE 0  END AS IsEligibleMicrocredential,
             (SELECT TOP 1 NotificationEmail FROM [dbo].[tblMicroCredentialEligibility] WHERE GroupId = @GroupID) AS NotificationEmail,
             (SELECT TOP 1 GroupName FROM [dbo].[tblMicroCredentialEligibility] WHERE GroupId = @GroupID) AS GroupName;

      SELECT  C.CourseID, C.CourseName FROM [dbo].[tblMicroCredentialEligibility] E
      JOIN [dbo].[tblCourse] C ON E.CourseID = C.CourseID WHERE E.GroupId = @GroupID;
        `;

        console.log('CheckMirco - 05');
    request.query(query, (err, result) => {
      if (err) console.log(err);
      if (result?.recordset) {
        console.log('CheckMirco - 06');
        const resultRow = result?.recordset?.[0];
        console.log('CheckMirco - 07');
        if (resultRow) {
          console.log('CheckMirco - 05');
          console.log(resultRow);
          if(resultRow.IsEligibleMicrocredential === 1){
            const courseList = result?.recordsets?.[1] || [];

          console.log('result - 06');
          console.log(courseList);
            const CourseNames = courseList.map(c => c.CourseName).join(", ");
            const notificationEmail = resultRow.NotificationEmail || 'jorgia@thegetgroup.co.nz';
            const groupName = resultRow.GroupName || 'Microcredential Group';

            console.log(`Sending microcredential notification to: ${notificationEmail}`);

            var data = {
              CourseName,
              StudentName,
              CourseNames,
              GroupName: groupName
            }
            // Pass the notification email as the 4th parameter
            SendTemplateEmail("E0004", `Microcredential Completion - ${StudentName}`, data, notificationEmail);
          }
        }
      }
    });
  } catch (error) {
    next(error);
  }
}

router.post("/SendCertificateRequestEmail", isAuthenticated, async function (req, res, next) {
    try {
      const pool = await getPool();
      const request = await pool.request();
      const id = req.body.id;
      const StudentID = req.body.StudentID;

      // Validate required fields
      if (!StudentID) {
        return res.send({ code: 1, message: "Student is required" });
      }

      request.input("id", sql.Int, id);

      const query = `
          UPDATE tblStudentInCourse SET CertificateRequested = 1, CertificateRequestedDate = GETDATE() WHERE id = @id;
        `;
        SendTemplateEmail("E0002", `Certificate Request Email`, req.body);
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

router.get("/AllUnitStandardByCourse", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();

    const id = Number(req.query.id);

    if (!id) {
      return res.send({ code: 0, data: [] });
    }

    request.input("id", sql.Int, id);

    const query = `
          SELECT US.UnitStandardID, US.US, US.USName, SIC.UnitStatus, SIC.IsAditional
          FROM [dbo].[tblStudentInCourseUnitStandard] SIC
          INNER JOIN [dbo].[tblUnitStandard] US ON SIC.UnitStandardID = US.UnitStandardID
          WHERE SIC.SICId = @id
          ORDER BY SIC.SICId ASC
        `;

    request.query(query, (err, result) => {
      if (err) console.log(err);
      if (result?.recordset) {
        const currentPageData = result.recordsets[0];
        return res.send({
          code: 0,
          data: currentPageData || [],
        });
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post("/Add", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();

    const {
      FirstName,
      LastName,
      SchoolName,
      Gender,
      DOB,
      Email,
      Ethnicity,
      Code,
    } = req.body;

    // Enhanced validation
    if (!FirstName || !LastName || !Email || !DOB || !Gender || !Ethnicity || !SchoolName) {
      return res.send({
        code: 1,
        message: "All required fields must be provided (FirstName, LastName, Email, DOB, Gender, Ethnicity, SchoolName)"
      });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(Email)) {
      return res.send({
        code: 1,
        message: "Invalid email format"
      });
    }

    // Safely handle SchoolNumber
    const SchoolNumber = req.body.SchoolNumber && !isNaN(req.body.SchoolNumber)
      ? Number(req.body.SchoolNumber)
      : null;

    // Convert DOB to proper datetime
    const dobDate = DOB ? new Date(DOB) : null;
    if (!dobDate || isNaN(dobDate.getTime())) {
      return res.send({
        code: 1,
        message: "Invalid date of birth format"
      });
    }

    // Get the current user's email from authentication
    const userEmail = req.info?.userPrincipalName || req.info?.mail || '';

    logger.info(`Adding new student: ${FirstName} ${LastName} (${Email}) by user ${userEmail}`);

    request.input("FirstName", sql.VarChar, FirstName);
    request.input("LastName", sql.VarChar, LastName);
    request.input("SchoolName", sql.VarChar, SchoolName);
    request.input("Gender", sql.VarChar, Gender);
    request.input("DOB", sql.DateTime, dobDate);
    request.input("Email", sql.VarChar, Email);
    request.input("Ethnicity", sql.VarChar, Ethnicity);
    request.input("SchoolNumber", sql.Int, SchoolNumber);
    request.input("Code", sql.VarChar, Code || "");
    request.input("UserEmail", sql.VarChar, userEmail);

    const query = `
      BEGIN TRY
        BEGIN TRANSACTION

        DECLARE @CreateDate DATETIME = GETDATE();
        DECLARE @StudentID INT = 0;
        DECLARE @TutorId INT = NULL;
        DECLARE @TutorName NVARCHAR(255) = NULL;
        DECLARE @CourseID INT = NULL;
        DECLARE @UnitStandardIDs NVARCHAR(MAX) = NULL;
        DECLARE @IsExist INT = 0;
        DECLARE @SICID INT;

        -- Look up the delivery specialist ID for the current user
        SELECT TOP 1 @TutorId = ds.Id, @TutorName = ds.DeliverySpecialist
        FROM tblDeliverySpecialist ds
        INNER JOIN tblAdminUser au ON ds.UserId = au.Id
        WHERE au.Email = @UserEmail;

        -- Check for existing student (to determine if we need a new record)
        SELECT TOP 1 @StudentID = StudentID
        FROM tblStudentInfo s
        WHERE FirstName = @FirstName
          AND LastName = @LastName
          AND Gender = @Gender
          AND Email = @Email
          AND Ethnicity = @Ethnicity
          AND DateOfBirth = @DOB;

        -- Always insert new student record for each workshop/enrollment
        -- This allows tracking students across multiple workshops
        INSERT INTO tblStudentInfo (
          Code, FirstName, LastName, School, SchoolName, SchoolNumber,
          Gender, DateOfBirth, Email, Ethnicity, CreateDate,
          isAdd, Status, TutorId, Tutor
        )
        VALUES (
          @Code, @FirstName, @LastName, @SchoolName, @SchoolName, @SchoolNumber,
          @Gender, @DOB, @Email, @Ethnicity, @CreateDate,
          1, 'On Going', @TutorId, @TutorName
        );

        SELECT @StudentID = @@IDENTITY;

        -- If Code is provided, link student to workshop via tblStudentInCourse
        IF (@Code IS NOT NULL AND @Code <> '')
        BEGIN
          SELECT TOP 1 @CourseID = CourseID, @UnitStandardIDs = UnitStandardIDs
          FROM tblWorkshop WHERE Code = @Code;

          IF (@CourseID > 0)
          BEGIN
            -- Check if already enrolled in this workshop
            SELECT @IsExist = COUNT(*)
            FROM tblStudentInCourse
            WHERE StudentID = @StudentID AND Code = @Code;

            IF (@IsExist = 0)
            BEGIN
              INSERT INTO tblStudentInCourse(StudentID, Code, CourseID, IsActive, LearnerType, CourseType, CreatDate, LastModifyDate)
              VALUES (@StudentID, @Code, @CourseID, 1, 2, 'Workshop', GETDATE(), GETDATE());

              SELECT @SICID = @@IDENTITY;

              -- Insert unit standards
              INSERT INTO tblStudentInCourseUnitStandard
              (StudentID, SICId, CourseID, UnitStandardID, IsAditional, IsActive, CreatDate, LastModifyDate)
              SELECT @StudentID, @SICID, @CourseID, UnitStandardID, 0, 1, GETDATE(), GETDATE()
              FROM [dbo].[tblCourseUnitStandard]
              WHERE CourseID = @CourseID
                OR (ISNULL(@UnitStandardIDs, '') <> '' AND UnitStandardID IN (SELECT CAST(value AS INT) FROM STRING_SPLIT(@UnitStandardIDs, ',')));
            END
          END
        END

        COMMIT TRANSACTION;

        -- Return the new StudentID for logging
        SELECT @StudentID as NewStudentID;

      END TRY
      BEGIN CATCH
        IF @@TRANCOUNT > 0
          ROLLBACK TRANSACTION;
        THROW;
      END CATCH
    `;

    request.query(query, (err, result) => {
      if (err) {
        logger.error(`Failed to add student ${FirstName} ${LastName}: ${err.message}`);

        if (err.number === 50001) {
          return res.send({
            code: 1,
            data: false,
            message: err.message,
          });
        }

        return res.send({
          code: 1,
          data: false,
          message: "An error occurred while adding the student. Please try again.",
        });
      }

      const newStudentID = result?.recordset?.[0]?.NewStudentID;
      logger.info(`Student added successfully: ${FirstName} ${LastName} (StudentID: ${newStudentID})`);

      return res.send({
        code: 0,
        data: "success",
        studentId: newStudentID,
      });
    });
  } catch (error) {
    logger.error(`Error in Add Student endpoint: ${error.message}`);
    next(error);
  }
}
);

router.get("/CommTypelist", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();

    let query = `SELECT * FROM tblCommunicationTemplates`;

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

router.get("/CommTypeAlllist", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();

    let query = `SELECT * FROM tblCommunicationTemplates WHERE (1 = 1)`;

    const Name = req.query.Name;
    const Category = req.query.Category;

    if (Name) {
      request.input("Name", sql.VarChar, `${Name}%`);
      query += ` AND Name Like @Name`;
    }

    if (Category) {
      request.input("Category", sql.VarChar, Category);
      query += ` AND Category = @Category`;
    }

    query += ` ORDER BY Category, Name`;

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

router.post("/CommTypeAdd", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();
    const id = Number(req.body.id);
    const {
      Name,
      Template,
      Subject,
      Category,
    } = req.body;

    // Detailed validation
    if (!Name) {
      return res.send({ code: 1, message: "Template name is required" });
    }
    if (!Template) {
      return res.send({ code: 1, message: "Template content is required" });
    }
    if (!Subject) {
      return res.send({ code: 1, message: "Email subject is required" });
    }

    // Check for duplicate template name
    const checkRequest = await pool.request();
    checkRequest.input("Name", sql.VarChar, Name);
    const checkQuery = `SELECT COUNT(*) as count FROM tblCommunicationTemplates WHERE Name = @Name`;
    const checkResult = await checkRequest.query(checkQuery);

    if (checkResult.recordset[0].count > 0) {
      return res.send({ code: 1, message: `A template with the name "${Name}" already exists. Please use a different name.` });
    }

    request.input("Name", sql.VarChar, Name);
    request.input("Template", sql.VarChar, Template);
    request.input("Subject", sql.VarChar, Subject);
    request.input("Category", sql.VarChar, Category || "General");

    const query = `
    INSERT INTO tblCommunicationTemplates (Name, Subject, Template, Category)
    VALUES   (@Name, @Subject, @Template, @Category)
    `;

    request.query(query, (err) => {
      if (err) {
        console.error("Error creating template:", err);
        return res.send({
          code: 1,
          message: "Failed to create template. Please try again.",
        });
      }
      return res.send({
        code: 0,
        data: "Template created successfully",
      });
    });
  } catch (error) {
    console.error("Error in CommTypeAdd:", error);
    next(error);
  }
});

router.post("/CommTypeUpdate", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();
    const id = Number(req.body.id);
    const {
      Name,
      Subject,
      Template,
      Category,
    } = req.body;

    // Detailed validation
    if (!id) {
      return res.send({ code: 1, message: "Template ID is required" });
    }
    if (!Name) {
      return res.send({ code: 1, message: "Template name is required" });
    }
    if (!Template) {
      return res.send({ code: 1, message: "Template content is required" });
    }
    if (!Subject) {
      return res.send({ code: 1, message: "Email subject is required" });
    }

    // Check for duplicate template name (excluding current template)
    const checkRequest = await pool.request();
    checkRequest.input("Name", sql.VarChar, Name);
    checkRequest.input("id", sql.Int, id);
    const checkQuery = `SELECT COUNT(*) as count FROM tblCommunicationTemplates WHERE Name = @Name AND id != @id`;
    const checkResult = await checkRequest.query(checkQuery);

    if (checkResult.recordset[0].count > 0) {
      return res.send({ code: 1, message: `A template with the name "${Name}" already exists. Please use a different name.` });
    }

    request.input("id", sql.Int, id);
    request.input("Subject", sql.VarChar, Subject);
    request.input("Name", sql.VarChar, Name);
    request.input("Template", sql.VarChar, Template);
    request.input("Category", sql.VarChar, Category || "General");

    const query = `
    Update tblCommunicationTemplates
    SET Name = @Name,
    Template = @Template,
    Subject = @Subject,
    Category = @Category
    WHERE (id = @id);
    `;

    request.query(query, (err) => {
      if (err) {
        console.error("Error updating template:", err);
        return res.send({
          code: 1,
          message: "Failed to update template. Please try again.",
        });
      }
      return res.send({
        code: 0,
        data: "Template updated successfully",
      });
    });
  } catch (error) {
    console.error("Error in CommTypeUpdate:", error);
    next(error);
  }
});

router.post("/CommTypeDelete", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();
    const { id } = req.body;

    if (!id) {
      return res.send({ code: 1, message: "Please select" });
    }

    request.input("id", sql.Int, id);

    const query = `
    DELETE FROM tblCommunicationTemplates WHERE (id = @id);
    `;

    request.query(query, (err) => {
      if (err) console.log(err);
      return res.send({
        code: 0,
        data: "Delete successfull",
      });
    });
  } catch (error) {
    next(error);
  }
});

router.get("/Commlist", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();

    let query = `
    SELECT  C.*, T.Name SubTypeName
    FROM tblCommunications C
    LEFT JOIN tblCommunicationTemplates T ON C.SubType = T.id
    WHERE (1 = 1) 
    `;

    const StudentId = req.query.StudentId;
    console.log("StudentId", StudentId);
    if (StudentId) {
      request.input("StudentId", sql.Int, StudentId);
      query += ` AND StudentId = @StudentId`;
    }
    console.log("StudentId", query);
    const Search = req.query.Search;
    if (Search) {
      request.input("Search", sql.VarChar, "%" + Search + "%");
      query += ` AND (CommunicationType LIKE @Search OR Message LIKE @Search OR CommDate LIKE @Search OR Message  LIKE @Search OR T.Name LIKE @Search)`;
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

async function GetEmailTemplate(data) {
  console.log("Start handles");
  const templatePath = path.join(__dirname, "email/emailtemplate.html");
  console.log(`templatePath path : ${templatePath}`);
  const templatePageContent = await fs.promises.readFile(templatePath, "utf8");
  console.log(`Read file from above path`);
  let htmlContent = templatePageContent;
  console.log("htmlContent varible create");

  let newDivs = "";
  let i = 0;
  console.log("strat key extractonr and page generate");
  
  const keys = Object.keys(data).filter((e) => e !== "items");
  const values = Object.values(data).filter((e) => e !== "items");
  const replacements = {};
  keys.forEach((key, index) => {
    const replacement = values[index];
    var repValue = typeof replacement === "string" ? replacement.replace(",", "") : replacement;
    replacements[`{${key}}`] = repValue;
  });
  htmlContent = htmlContent.replace(
    new RegExp(keys.map((key) => `{${key.toUpperCase()}}`).join("|"), "g"),
    (matched) => replacements[matched.toLowerCase()]
  );

  console.log("End html generate");
  return htmlContent;
}

async function sendEmail(emailAddress, subject, message, attachmentFile) {
  try {
    
  console.log("x01");
    const accessToken = await getToken();

    console.log("x02");
    var data = {
      learnername: "Anuradha Jayalath",
      emailbody: message,
    };

    console.log("x03");
    var htmlContent = await GetEmailTemplate(data);

    console.log("x04");

    console.log('File name:', attachmentFile.originalname);
    console.log('File mime type:', attachmentFile.mimetype);
    console.log('File bytes:', attachmentFile.buffer);
    var attachment = {
      ...(attachmentFile && {
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: `${attachmentFile.originalname}`,
        contentType: `${attachmentFile.mimetype}`,
        contentBytes: attachmentFile.buffer.toString('base64'),
      })
    };
    
    console.log("x04");
    console.log(attachmentFile);
    console.log("attachments");
    const mailOptions = {
      message: {
        subject: `${subject}`,
        body: {
          contentType: "HTML",
          content: htmlContent,
        },
        toRecipients: [
          {
            emailAddress: {
              address: emailAddress,
            },
          },
        ],
        attachments: [attachment], 
      },
      saveToSentItems: "true",
    };

    const response = await axios.post(sendMailUrl, mailOptions, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });
  }
  catch (ex) {
    console.error("Error sending email:", ex?.response?.data || ex.message);
    return { code: 1, error: ex.message || "Unknown error" };
  }
}

const attachmentStorage = multer.memoryStorage();
const attachmentUpload = multer({ storage: attachmentStorage });

router.post("/CommAdd", attachmentUpload.single('AttachFile'), async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();
    const { StudentId, CommunicationType, Email, SubType, SubTypeName, Subject, Message } = req.body;

    if (!StudentId) {
      return res.send({ code: 1, message: "Code Error" });
    }

    if (!CommunicationType) {
      return res.send({ code: 1, message: "Communication Type Error" });
    }
    const file = req.file;
    console.log('File');
    console.log(file);
      // Check if file was uploaded
      if (file) {
        console.log('File name:', file.originalname);
        console.log('File mime type:', file.mimetype);
        console.log('File bytes:', file.buffer); // Buffer object
        request.input("Attachments", sql.VarChar, file.originalname);
    
      }
      else{
        request.input("Attachments", sql.VarChar, "");
    
      }
  

    request.input("StudentId", sql.Int, StudentId);
    request.input("CommunicationType", sql.VarChar, CommunicationType);
    request.input("SubType", sql.Int, SubType);
    request.input("Message", sql.VarChar, Message);
    
    const query = `
        DECLARE @CreateDate DATETIME = GETDATE();
        DECLARE @Time NVARCHAR(10);
        SELECT @Time = FORMAT(GETDATE(), 'HH:mm');
        INSERT INTO tblCommunications(StudentId, CommunicationType, CommDate, CommTime, Message, SubType, Attachments)
        VALUES(@StudentId, @CommunicationType, GETDATE(), @Time, @Message, @SubType, @Attachments);
        UPDATE tblStudentInfo SET LastCommunicateDate = GETDATE() WHERE (StudentID = @StudentId);
    `;

    try {
      await request.query(query); // ⬅ Wait for query to complete

      await sendEmail(Email, Subject, Message, file); // ⬅ Wait for email to be sent

      return res.send({
        code: 0,
        data: "success",
      });
    } catch (err) {
      console.error("Error:", err);
      return res.status(500).send({
        code: 1,
        error: err.message || "Internal server error",
      });
    }
  } catch (error) {
    next(error);
  }
}
);

router.post("/CommUpdate", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();
    const { id, StudentId, CommunicationType, SubType, CommDate, CommTime, Message } = req.body;

    if (!id) {
      return res.send({ code: 1, message: "Invalid communication Id" });
    }

    request.input("Id", sql.Int, id || 0);
    request.input("StudentId", sql.Int, StudentId);
    request.input("CommunicationType", sql.VarChar, CommunicationType);
    request.input("SubType", sql.Int, SubType);
    request.input("CommDate", sql.VarChar, CommDate);
    request.input("CommTime", sql.VarChar, CommTime);
    request.input("Message", sql.VarChar, Message);
    const query = `
    IF(@Id > 0)
    BEGIN 
      UPDATE tblCommunications
      SET StudentId = @StudentId, CommunicationType = @CommunicationType, CommDate = @CommDate, CommTime = @CommTime, Message = @Message
      WHERE (Id = @Id)
    END
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


router.put("/UpdateLastCommDate", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();
    const {StudentId, CommDate } = req.body;

    if (!StudentId) {
      return res.send({ code: 1, message: "Invalid Student Id" });
    }

    request.input("Id", sql.Int, StudentId || 0);
    request.input("StudentId", sql.Int, StudentId);
    request.input("CommDate", sql.VarChar, CommDate);
    const query = `
    IF(@Id > 0)
    BEGIN 
      UPDATE tblStudentInfo SET LastCommunicateDate = @CommDate WHERE (StudentId = @Id)
    END
  `;
  console.log("query");
  console.log(query);
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

router.post("/Commdelete", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();
    const { id, StudentId, CommunicationType, SubType, CommDate, CommTime, Message } = req.body;

    if (!id) {
      return res.send({ code: 1, message: "Invalid communication Id" });
    }

    request.input("Id", sql.Int, id || 0);
    const query = `
      DELETE FROM tblCommunications WHERE (Id = @Id)
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


router.post("/sendTestEmail", isAuthenticated, async function (req, res, next) {
  try {
    const { email, subject, template } = req.body;

    if (!email || !subject || !template) {
      return res.send({
        code: 1,
        message: "Email, subject, and template are required"
      });
    }

    // Replace template variables with sample data
    let testMessage = template;
    testMessage = testMessage.replace(/{LearnerName}/g, 'John Smith (Sample)');
    testMessage = testMessage.replace(/{CourseName}/g, 'Introduction to Farming (Sample)');

    const accessToken = await getToken();

    const data = {
      learnername: "Test User",
      emailbody: testMessage,
    };

    const htmlContent = await GetEmailTemplate(data);

    const mailOptions = {
      message: {
        subject: `[TEST] ${subject}`,
        body: {
          contentType: "HTML",
          content: htmlContent,
        },
        toRecipients: [
          {
            emailAddress: {
              address: email,
            },
          },
        ],
      },
      saveToSentItems: "false",
    };

    await axios.post(sendMailUrl, mailOptions, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    console.log(`Test email sent to: ${email}`);

    return res.send({
      code: 0,
      message: "Test email sent successfully",
    });
  } catch (error) {
    console.error("Error sending test email:", error?.response?.data || error.message);
    return res.send({
      code: 1,
      message: "Failed to send test email",
      error: error?.message || "Unknown error",
    });
  }
});

router.get("/attachments-list", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();
    //   if (!req?.admin)  {
    //   return res.send({ code: 403, data: [], message: "no permission" });
    // }
    const current = Number(req.query.current || 1);
    const pageSize = Number(req.query.pageSize || 10);
    const total = Number(req.query.pageSize || 10);
    const ID = Number(req.query.ID || 0);

    request.input("ID", sql.Int, ID);

    const query = `SELECT * FROM  tblCommunicationTemplates WHERE id = @ID; `;

    request.query(query, (err, result) => {
      if (err) console.log(err);
      if (result?.recordset) {
        const currentPageData = result.recordsets[0];
        return res.send({
          code: 0,
          data: currentPageData,
          pagination: getPagination(current, pageSize, total),
        });
      }

      return res.send({ code: 0, data: [], pagination: null });
    });
  } catch (error) {
    next(error);
  }
});

/*
const attachmentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, "email/attachements");
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath);
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    console.log("req.FileSaveName", req.FileSaveName);
    console.log("req.userId", req.userId);
    const customName = req.body.FileSaveName || `${Date.now()}-${file.originalname}`;
    cb(null, customName);
  }
});

const upload = multer({ storage });

router.post("/uploaddoc", upload.single("file"), async (req, res) => {
  try {
    const {
      StudentID,
      FileName,
      ImageList
    } = req.body;
    if (!StudentID) {
      return res.send({ code: 400, message: "StudentID is required" });
    }

    var FileSaveName = req.file.filename;

    const pool = await getPool();
    const request = await pool.request();
    request.input("StudentID", sql.Int, StudentID);
    var imgList = JSON.parse(ImageList);
    imgList.push({ "FileSaveName": FileSaveName, "FileName": FileName });
    request.input("AdditionalDocuments", sql.VarChar, JSON.stringify(imgList));
    const query = `
      UPDATE tblStudentInfo
      SET AdditionalDocuments = @AdditionalDocuments
      WHERE StudentID = @StudentID;
    `;

    await request.query(query);
    return res.send({ code: 0, data: "success", message: "File uploaded successfully" });
  } catch (error) {

    return res.send({ code: 404, message: "File uploaded faild" });
  }
});
*/

// Public API to check if student exists (for duplicate detection)
router.post("/checkDuplicate", async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();
    const { FirstName, LastName, DateOfBirth, Email, School } = req.body;

    if (!FirstName || !LastName) {
      return res.send({ code: 1, message: "FirstName and LastName are required" });
    }

    // Convert date from DD/MM/YYYY to YYYY-MM-DD if needed
    let formattedDOB = DateOfBirth || null;
    if (formattedDOB && typeof formattedDOB === 'string' && formattedDOB.includes('/')) {
      const parts = formattedDOB.split('/');
      if (parts.length === 3) {
        formattedDOB = `${parts[2]}-${parts[1]}-${parts[0]}`; // Convert DD/MM/YYYY to YYYY-MM-DD
      }
    }

    console.log('Duplicate check params:', {
      FirstName,
      LastName,
      DateOfBirth: DateOfBirth,
      FormattedDOB: formattedDOB,
      School
    });

    request.input("FirstName", sql.VarChar, FirstName);
    request.input("LastName", sql.VarChar, LastName);
    request.input("DateOfBirth", sql.VarChar, formattedDOB);
    request.input("Email", sql.VarChar, Email || "");
    request.input("School", sql.VarChar, School || "");

    // Match students where ALL criteria match: FirstName AND LastName AND DOB AND School
    // This ensures we only show true duplicates, not partial matches
    let query = `
      SELECT StudentID, FirstName, LastName, Email, DateOfBirth, Gender, Ethnicity, PhoneNumber, School, SchoolName, SchoolNumber, Status
      FROM tblStudentInfo
      WHERE FirstName = @FirstName
        AND LastName = @LastName
        AND (IsDeleted IS NULL OR IsDeleted = 0)
    `;

    // Require DOB to match if provided (strict matching)
    if (DateOfBirth) {
      query += ` AND DateOfBirth = @DateOfBirth`;
    }

    // Require School to match if provided (case-insensitive, flexible matching)
    if (School) {
      query += ` AND (LOWER(School) LIKE '%' + LOWER(@School) + '%' OR LOWER(SchoolName) LIKE '%' + LOWER(@School) + '%')`;
    }

    console.log('Duplicate check query:', query);

    const result = await request.query(query);
    const students = result.recordset || [];

    console.log('Duplicate check results:', students.length, 'students found');

    if (students.length > 0) {
      return res.send({
        code: 0,
        data: {
          exists: true,
          students: students,
          message: `Found ${students.length} potential match(es)`
        }
      });
    } else {
      return res.send({
        code: 0,
        data: {
          exists: false,
          students: [],
          message: "No matching students found"
        }
      });
    }
  } catch (error) {
    console.error("Error checking duplicate:", error);
    return res.send({ code: 500, message: "Error checking student" });
  }
});

// Public API for remote learner registration
router.post("/remoteRegister", async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();

    const {
      FirstName,
      LastName,
      DateOfBirth,
      Gender,
      Ethnicity,
      PhoneNumber,
      Email,
      School,
      SchoolNumber,
      TeacherName,
      TeacherEmail,
      InvoiceEmail,
      WorkbookOption,
      StreetAddress,
      City,
      Region,
      Zipcode,
      NZQAPreference,
      AdditionalInfo,
      CourseCategory, // "Work & Life Skills" or "Farming & Horticulture"
      SelectedCourses, // Array of course IDs or unit standard IDs
      CustomCourse,
      Agreement,
      ExistingStudentID // If user selected "This Is Me" from duplicate modal
    } = req.body;

    console.log('Remote register - ExistingStudentID:', ExistingStudentID);

    // Validation
    if (!FirstName || !LastName || !Email || !CourseCategory) {
      return res.send({
        code: 1,
        message: "Required fields missing: FirstName, LastName, Email, CourseCategory"
      });
    }

    if (!Agreement) {
      return res.send({
        code: 1,
        message: "You must agree to the terms to register"
      });
    }

    // Convert date from DD/MM/YYYY to YYYY-MM-DD if needed
    let formattedDOB = DateOfBirth || null;
    if (formattedDOB && typeof formattedDOB === 'string' && formattedDOB.includes('/')) {
      const parts = formattedDOB.split('/');
      if (parts.length === 3) {
        formattedDOB = `${parts[2]}-${parts[1]}-${parts[0]}`; // Convert DD/MM/YYYY to YYYY-MM-DD
      }
    }

    // Input parameters
    request.input("FirstName", sql.VarChar, FirstName);
    request.input("LastName", sql.VarChar, LastName);
    request.input("DateOfBirth", sql.VarChar, formattedDOB);
    request.input("Gender", sql.VarChar, Gender || "");
    request.input("Ethnicity", sql.VarChar, Ethnicity || "");
    request.input("PhoneNumber", sql.VarChar, PhoneNumber || "");
    request.input("Email", sql.VarChar, Email);
    request.input("School", sql.VarChar, School || "");
    request.input("SchoolNumber", sql.Int, SchoolNumber || 0);
    request.input("TeacherName", sql.VarChar, TeacherName || "");
    request.input("TeacherEmail", sql.VarChar, TeacherEmail || "");
    request.input("InvoiceEmail", sql.VarChar, InvoiceEmail || "");
    request.input("WorkbookOption", sql.VarChar, WorkbookOption || "");
    request.input("StreetAddress", sql.VarChar, StreetAddress || "");
    request.input("City", sql.VarChar, City || "");
    request.input("Region", sql.VarChar, Region || "");
    request.input("Zipcode", sql.VarChar, Zipcode || "");
    request.input("AdditionalInfo", sql.VarChar, AdditionalInfo || "");
    request.input("CourseCategory", sql.VarChar, CourseCategory);
    request.input("SelectedCourses", sql.VarChar, JSON.stringify(SelectedCourses || []));
    request.input("CustomCourse", sql.VarChar, CustomCourse || "");
    request.input("NZQAPreference", sql.VarChar, NZQAPreference || "");
    request.input("ExistingStudentID", sql.Int, ExistingStudentID || 0);

    const query = `
      BEGIN TRY
        BEGIN TRANSACTION

        DECLARE @CreateDate DATETIME = GETDATE();
        DECLARE @StudentID INT = @ExistingStudentID;
        DECLARE @SICId INT = 0;
        DECLARE @EnrolledCount INT = 0;
        DECLARE @DefaultTutorId INT = NULL;
        DECLARE @DefaultTutorName NVARCHAR(255) = NULL;

        -- Get the default teacher (marked as default in tblDeliverySpecialist)
        SELECT TOP 1 @DefaultTutorId = Id, @DefaultTutorName = DeliverySpecialist
        FROM tblDeliverySpecialist
        WHERE MarkAsDefault = 1;

        PRINT 'Default Teacher ID: ' + ISNULL(CAST(@DefaultTutorId AS VARCHAR), 'NULL');
        PRINT 'Default Teacher Name: ' + ISNULL(@DefaultTutorName, 'NULL');

        -- If ExistingStudentID is provided, use that existing student record
        -- Otherwise, create a new student record
        IF (@StudentID = 0)
        BEGIN
          -- Insert new remote learner (Code is NULL for remote learners)
          -- Automatically assign to the default teacher
        INSERT INTO tblStudentInfo (
          FirstName, LastName, DateOfBirth, Gender, Ethnicity, PhoneNumber,
          Email, School, SchoolNumber, TeacherName, TeacherEmail, InvoiceEmail, WorkbookOption,
          StreetAddress, City, Region, Zipcode, AdditionalInfo, CreateDate,
          isAdd, Status, NZQAInfo, WorklifeCourses, FarmingUnits,
          TutorId, Tutor
        )
        VALUES (
          @FirstName, @LastName, @DateOfBirth, @Gender, @Ethnicity, @PhoneNumber,
          @Email, @School, @SchoolNumber, @TeacherName, @TeacherEmail, @InvoiceEmail, @WorkbookOption,
          @StreetAddress, @City, @Region, @Zipcode, @AdditionalInfo, @CreateDate,
          0, 'Pending', @NZQAPreference,
          CASE WHEN @CourseCategory = 'Work & Life Skills' THEN @SelectedCourses ELSE NULL END,
          CASE WHEN @CourseCategory = 'Farming & Horticulture' THEN @SelectedCourses ELSE NULL END,
          @DefaultTutorId, @DefaultTutorName
        )
          SELECT @StudentID = @@IDENTITY;

          PRINT 'New student created with ID: ' + CAST(@StudentID AS VARCHAR);
          PRINT 'Assigned to default teacher: ' + ISNULL(@DefaultTutorName, 'NULL');
        END
        ELSE
        BEGIN
          PRINT 'Using existing student ID: ' + CAST(@StudentID AS VARCHAR);
        END

        PRINT 'Course Category: ' + @CourseCategory;
        PRINT 'Selected Courses JSON: ' + @SelectedCourses;

        -- Enroll student in selected courses
        IF(@CourseCategory = 'Work & Life Skills' AND ISNULL(@SelectedCourses, '[]') != '[]')
        BEGIN
          PRINT 'Attempting to enroll in Work & Life Skills courses...';

          -- Parse JSON array and enroll in each course
          INSERT INTO tblStudentInCourse (StudentID, CourseID, IsActive, LearnerType, CourseType, CreatDate, LastModifyDate, CourseStatus)
          SELECT
            @StudentID,
            CAST(value AS INT),
            1,
            3, -- Remote Learner type
            @CourseCategory,
            GETDATE(),
            GETDATE(),
            'Pending'
          FROM OPENJSON(@SelectedCourses);

          SET @EnrolledCount = @@ROWCOUNT;
          PRINT 'Enrolled in ' + CAST(@EnrolledCount AS VARCHAR) + ' courses';

          -- Get the inserted id for adding unit standards
          DECLARE course_cursor CURSOR FOR
            SELECT id, CourseID
            FROM tblStudentInCourse
            WHERE StudentID = @StudentID AND CourseType = @CourseCategory;

          DECLARE @CourseID INT;
          OPEN course_cursor;
          FETCH NEXT FROM course_cursor INTO @SICId, @CourseID;

          WHILE @@FETCH_STATUS = 0
          BEGIN
            PRINT 'Adding unit standards for SICId: ' + CAST(@SICId AS VARCHAR) + ', CourseID: ' + CAST(@CourseID AS VARCHAR);

            -- Add unit standards for each course
            INSERT INTO tblStudentInCourseUnitStandard
              (StudentID, SICId, CourseID, UnitStandardID, IsAditional, IsActive, CreatDate, LastModifyDate)
            SELECT
              @StudentID,
              @SICId,
              @CourseID,
              UnitStandardID,
              0,
              1,
              GETDATE(),
              GETDATE()
            FROM tblCourseUnitStandard
            WHERE CourseID = @CourseID;

            PRINT 'Added ' + CAST(@@ROWCOUNT AS VARCHAR) + ' unit standards';
            FETCH NEXT FROM course_cursor INTO @SICId, @CourseID;
          END

          CLOSE course_cursor;
          DEALLOCATE course_cursor;
        END

        IF(@CourseCategory = 'Farming & Horticulture' AND ISNULL(@SelectedCourses, '[]') != '[]')
        BEGIN
          PRINT 'Attempting to enroll in Farming & Horticulture...';

          -- Get or create Farming & Horticulture course
          DECLARE @FarmingCourseID INT;
          SELECT TOP 1 @FarmingCourseID = CourseID
          FROM tblCourse
          WHERE CourseName = 'Farming & Horticulture';

          PRINT 'Farming & Horticulture CourseID: ' + CAST(@FarmingCourseID AS VARCHAR);

          -- Create student in course record
          INSERT INTO tblStudentInCourse (StudentID, CourseID, IsActive, LearnerType, CourseType, CreatDate, LastModifyDate, CourseStatus)
          VALUES (@StudentID, @FarmingCourseID, 1, 3, @CourseCategory, GETDATE(), GETDATE(), 'Pending');

          SELECT @SICId = @@IDENTITY;
          PRINT 'Created SICId: ' + CAST(@SICId AS VARCHAR);

          -- Add selected unit standards
          INSERT INTO tblStudentInCourseUnitStandard
            (StudentID, SICId, CourseID, UnitStandardID, IsAditional, IsActive, CreatDate, LastModifyDate)
          SELECT
            @StudentID,
            @SICId,
            @FarmingCourseID,
            CAST(value AS INT),
            0,
            1,
            GETDATE(),
            GETDATE()
          FROM OPENJSON(@SelectedCourses);

          PRINT 'Added ' + CAST(@@ROWCOUNT AS VARCHAR) + ' unit standards';
        END

        COMMIT;
        SELECT @StudentID AS StudentID, @EnrolledCount AS EnrolledCount;

      END TRY
      BEGIN CATCH
        IF @@TRANCOUNT > 0
          ROLLBACK;

        DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
        DECLARE @ErrorNumber INT = ERROR_NUMBER();
        PRINT 'Error occurred: ' + @ErrorMessage;
        THROW;
      END CATCH
    `;

    // Capture SQL PRINT messages
    request.on('info', (info) => {
      console.log('[SQL INFO]', info.message);
    });

    const result = await request.query(query);
    const studentID = result.recordset[0]?.StudentID;
    const enrolledCount = result.recordset[0]?.EnrolledCount;

    console.log('Registration result:', { studentID, enrolledCount });

    if (studentID) {
      return res.send({
        code: 0,
        data: {
          StudentID: studentID,
          EnrolledCount: enrolledCount || 0,
          message: "Registration successful! You will receive a welcome email and invoice within 48 hours."
        }
      });
    } else {
      return res.send({
        code: 1,
        message: "Registration failed. Student may already exist."
      });
    }
  } catch (error) {
    console.error("Error in remote registration:", error);
    console.error("Error details:", {
      number: error.number,
      message: error.message,
      stack: error.stack
    });

    if (error.number === 50001) {
      return res.send({
        code: 1,
        message: "This student is already registered. Please contact us if you need to update your information."
      });
    }
    return res.send({
      code: 500,
      message: "Registration failed. Please try again.",
      error: error.message
    });
  }
});

// Get all workshops for a student
router.get("/getStudentWorkshops", async function (req, res, next) {
  try {
    const { StudentID } = req.query;

    console.log('Getting workshops for StudentID:', StudentID);

    const pool = await getPool();
    const request = pool.request();

    request.input("StudentID", sql.Int, StudentID);

    const query = `
      SELECT
        sic.id as StudentInCourseID,
        sic.Code,
        CASE WHEN sic.IsActive = 1 THEN 'Active' ELSE 'Inactive' END as Status,
        c.CourseName,
        w.SchoolName,
        w.SchoolNumber
      FROM tblStudentInCourse sic
      LEFT JOIN tblCourse c ON sic.CourseID = c.CourseID
      LEFT JOIN tblWorkshop w ON sic.Code = w.Code
      WHERE sic.StudentID = @StudentID
        AND sic.Code IS NOT NULL
        AND sic.IsActive = 1
      ORDER BY sic.CreatDate DESC
    `;

    const result = await request.query(query);

    console.log('Found workshops:', result.recordset.length);

    return res.send({
      code: 0,
      data: result.recordset
    });
  } catch (error) {
    console.error("Error getting student workshops:", error);
    return res.send({
      code: 500,
      message: "Failed to get student workshops",
      error: error.message
    });
  }
});

// Get all available workshops
router.get("/getAllWorkshops", async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = pool.request();

    const query = `
      SELECT DISTINCT
        w.Code,
        w.CourseName,
        w.SchoolName,
        w.SchoolNumber
      FROM tblWorkshop w
      WHERE w.Code IS NOT NULL
      ORDER BY w.SchoolName, w.CourseName
    `;

    const result = await request.query(query);

    console.log('Found available workshops:', result.recordset.length);

    return res.send({
      code: 0,
      data: result.recordset
    });
  } catch (error) {
    console.error("Error getting all workshops:", error);
    return res.send({
      code: 500,
      message: "Failed to get workshops",
      error: error.message
    });
  }
});

// Add workshop enrollment for a student
router.post("/addWorkshopEnrollment", async function (req, res, next) {
  try {
    const { StudentID, WorkshopCode } = req.body;

    console.log('Adding workshop enrollment:', { StudentID, WorkshopCode });

    const pool = await getPool();
    const request = pool.request();

    request.input("StudentID", sql.Int, StudentID);
    request.input("WorkshopCode", sql.VarChar, WorkshopCode);

    // First check if enrollment already exists
    const checkQuery = `
      SELECT COUNT(*) as Count
      FROM tblStudentInCourse
      WHERE StudentID = @StudentID
        AND Code = @WorkshopCode
        AND IsActive = 1
    `;

    const checkResult = await request.query(checkQuery);

    if (checkResult.recordset[0].Count > 0) {
      return res.send({
        code: 1,
        success: false,
        message: "Student is already enrolled in this workshop"
      });
    }

    // Get workshop details
    const request2 = pool.request();
    request2.input("WorkshopCode", sql.VarChar, WorkshopCode);

    const workshopQuery = `
      SELECT TOP 1
        w.Code,
        w.CourseID,
        w.CourseName,
        w.SchoolName,
        w.SchoolNumber
      FROM tblWorkshop w
      WHERE w.Code = @WorkshopCode
    `;

    const workshopResult = await request2.query(workshopQuery);

    if (workshopResult.recordset.length === 0) {
      return res.send({
        code: 1,
        success: false,
        message: "Workshop not found"
      });
    }

    const workshop = workshopResult.recordset[0];

    // Insert enrollment
    const request3 = pool.request();
    request3.input("StudentID", sql.Int, StudentID);
    request3.input("CourseID", sql.Int, workshop.CourseID);
    request3.input("Code", sql.VarChar, workshop.Code);

    const insertQuery = `
      INSERT INTO tblStudentInCourse
        (StudentID, CourseID, Code, IsActive, LearnerType, CourseType, CreatDate, LastModifyDate, CourseStatus)
      VALUES
        (@StudentID, @CourseID, @Code, 1, 2, 'Workshop', GETDATE(), GETDATE(), 'Pending')

      SELECT @@IDENTITY as NewID
    `;

    const insertResult = await request3.query(insertQuery);
    const newID = insertResult.recordset[0].NewID;

    console.log('Workshop enrollment created with ID:', newID);

    return res.send({
      code: 0,
      success: true,
      message: "Workshop enrollment added successfully",
      data: { StudentInCourseID: newID }
    });
  } catch (error) {
    console.error("Error adding workshop enrollment:", error);
    return res.send({
      code: 500,
      success: false,
      message: "Failed to add workshop enrollment",
      error: error.message
    });
  }
});

// Remove workshop enrollment for a student
router.post("/removeWorkshopEnrollment", async function (req, res, next) {
  try {
    const { StudentInCourseID } = req.body;

    console.log('Removing workshop enrollment ID:', StudentInCourseID);

    const pool = await getPool();
    const request = pool.request();

    request.input("StudentInCourseID", sql.Int, StudentInCourseID);

    // Mark as inactive to remove workshop enrollment
    const query = `
      UPDATE tblStudentInCourse
      SET IsActive = 0, LastModifyDate = GETDATE()
      WHERE id = @StudentInCourseID
    `;

    await request.query(query);

    console.log('Workshop enrollment removed successfully');

    return res.send({
      code: 0,
      success: true,
      message: "Workshop enrollment removed successfully"
    });
  } catch (error) {
    console.error("Error removing workshop enrollment:", error);
    return res.send({
      code: 500,
      success: false,
      message: "Failed to remove workshop enrollment",
      error: error.message
    });
  }
});

module.exports = router;
