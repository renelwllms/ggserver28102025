const express = require("express");
const router = express.Router();
const isAuthenticated = require("./auth");
const { getPagination, getPool } = require("./utils");
const sql = require("mssql");

router.get("/school", async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();

    let query = `
    SELECT tblSchoolWorkplace.SchoolNumber, tblSchoolWorkplace.SchoolName, tblSchoolWorkplace.Telephone, tblSchoolWorkplace.Fax, tblSchoolWorkplace.Email, tblSchoolWorkplace.SchoolWebsite, tblSchoolWorkplace.Street, tblSchoolWorkplace.Suburb, tblSchoolWorkplace.DHB, tblSchoolWorkplace.City, tblSchoolWorkplace.PostalAddress1, tblSchoolWorkplace.PostalAddress2, tblSchoolWorkplace.PostalAddress3, tblSchoolWorkplace.PostalCode, tblSchoolWorkplace.SchooolNotes, tblSchoolWorkplace.UrbanArea, tblSchoolWorkplace.SchoolType
    FROM tblSchoolWorkplace WHERE IsDeleted = 0 `;

    const SchoolName = req.query.SchoolName;

    if (SchoolName) {
      request.input("SchoolName", sql.VarChar, SchoolName);
      query += ` AND [SchoolName] LIKE '%' + @SchoolName + '%'`;
    }

    request.query(query, (err, result) => {
      if (err) {
        return res.send({ code: 1, message: "Error" });
      }

      if (result?.recordset) {
        return res.send({
          code: 0,
          data: result.recordsets[0],
        });
      }

      return res.send({ code: 0, data: [] });
    });
  } catch (error) {
    next(error);
  }
});

router.get("/report1", isAuthenticated, async function (req, res, next) {
  try {
    // if (!req?.admin) {
    //   return res.send({ code: 403, message: "no permission" });
    // }
    const pool = await getPool(); // Get database connection pool
    const request = await pool.request();

    const year = req.query.year || new Date().getFullYear(); // Get the year from query parameters or use current year
    request.input("Year", sql.Int, year); // Input the year parameter

    // Initialize the queries

    let workshopQuery = `
          SELECT MONTH(CreateDate) AS Month, COUNT(*) AS WorkshopLearnerEnrollments
          FROM dbo.tblStudentInfo
          WHERE YEAR(CreateDate) = @Year
          AND (ISNULL(Code,'')  <> '')
          AND (IsDeleted IS NULL OR IsDeleted = 0)
          GROUP BY MONTH(CreateDate)
      `;

    let enrollmentQuery = `
      SELECT MONTH(CreateDate) AS Month, COUNT(*) AS LearnerEnrollments
      FROM dbo.tblStudentInfo
      WHERE YEAR(CreateDate) = @Year
      AND (ISNULL(Code,'')  = '')
      AND (IsDeleted IS NULL OR IsDeleted = 0)
      GROUP BY MONTH(CreateDate)
  `;

    let WithdrawsQuery = `
        SELECT 
        Month,
        SUM(WithdrawsCount) AS TotalWithdrawsCount
        FROM (
        SELECT 
          MONTH(CreateDate) AS Month, 
          COUNT(*) AS WithdrawsCount
        FROM 
          dbo.enrollment
        WHERE 
          YEAR(CreateDate) = @Year
          AND (Status = 'Did Not Complete' OR Status = 'Withdraws') 
          AND (IsDeleted IS NULL OR IsDeleted = 0)
        GROUP BY 
          MONTH(CreateDate)

        UNION ALL

        SELECT 
          MONTH(CreateDate) AS Month, 
          COUNT(*) AS WithdrawsCount
        FROM 
          dbo.tblStudentInfo
        WHERE 
          YEAR(CreateDate) = @Year
          AND (Status = 'Did Not Complete' OR Status = 'Withdraws')
          AND (IsDeleted IS NULL OR IsDeleted = 0)
        GROUP BY 
          MONTH(CreateDate)
        ) AS CombinedResults
        GROUP BY 
        Month
        ORDER BY 
        Month;
      `;

    // Execute queries
    const workshopResult = await request.query(workshopQuery);
    const enrollmentResult = await request.query(enrollmentQuery);
    const WithdrawsResult = await request.query(WithdrawsQuery);

    // Process results
    const monthlyData = Array.from({ length: 12 }, (_, i) => ({
      Month: new Date(year, i).toLocaleString("en-US", { month: "long" }),
      LearnerEnrollments: 0,
      WorkshopLearnerEnrollments: 0,
      TotalWithdrawsCount: 0,
    }));

    // Fill in data from enrollment results
    enrollmentResult.recordset.forEach((row) => {
      monthlyData[row.Month - 1].LearnerEnrollments = row.LearnerEnrollments;
    });

    // Fill in data from workshop results
    workshopResult.recordset.forEach((row) => {
      monthlyData[row.Month - 1].WorkshopLearnerEnrollments =
        row.WorkshopLearnerEnrollments;
    });

    // Fill in data from Withdraws results
    WithdrawsResult.recordset.forEach((row) => {
      monthlyData[row.Month - 1].TotalWithdrawsCount = row.TotalWithdrawsCount;
    });

    // Calculate totals
    const totals = monthlyData.reduce(
      (acc, row) => {
        acc.LearnerEnrollments += row.LearnerEnrollments;
        acc.WorkshopLearnerEnrollments += row.WorkshopLearnerEnrollments;
        acc.TotalWithdrawsCount += row.TotalWithdrawsCount;
        return acc;
      },
      {
        LearnerEnrollments: 0,
        WorkshopLearnerEnrollments: 0,
        TotalWithdrawsCount: 0,
      }
    );

    // Add totals to the data
    monthlyData.push({
      Month: "Total",
      LearnerEnrollments: totals.LearnerEnrollments,
      WorkshopLearnerEnrollments: totals.WorkshopLearnerEnrollments,
      TotalWithdrawsCount: totals.TotalWithdrawsCount,
    });

    // Send the response
    return res.send({
      code: 0,
      data: monthlyData,
    });
  } catch (error) {
    next(error); // Pass any errors to the error handling middleware
  }
});

router.get("/report2", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();

    const { startYear, endYear } = req.query;

    if (!startYear || !endYear) {
      return res
        .status(400)
        .send({ code: 1, message: "Start year and end year are required" });
    }

    request.input("StartYear", sql.Int, startYear);
    request.input("EndYear", sql.Int, endYear);

    const regionsQuery = `
      SELECT DISTINCT [EducationRegion]
      FROM [dbo].[tblSchoolWorkplace]
      WHERE [EducationRegion] IS NOT NULL
    `;
    const regionsResult = await request.query(regionsQuery);
    const regions = regionsResult.recordset.map(
      (record) => record.EducationRegion
    );

    if (regions.length === 0) {
      return res.send({ code: 0, data: [] });
    }

    const statsQuery = `
      SELECT 
        YEAR(w.[CourseDate]) AS Year,
        ISNULL(sw.[EducationRegion], 'Other') AS EducationRegion,
        COUNT(*) AS WorkshopCount
      FROM [dbo].[tblWorkshop] w
      LEFT JOIN [dbo].[tblSchoolWorkplace] sw ON w.[SchoolNumber] = sw.[SchoolNumber]
      WHERE YEAR(w.[CourseDate]) BETWEEN @StartYear AND @EndYear
      GROUP BY YEAR(w.[CourseDate]), ISNULL(sw.[EducationRegion], 'Other')
      ORDER BY YEAR(w.[CourseDate])
    `;
    const statsResult = await request.query(statsQuery);

    const yearRange = [];
    for (let year = parseInt(startYear); year <= parseInt(endYear); year++) {
      yearRange.push(year);
    }

    const data = [];
    yearRange.forEach((year) => {
      const row = { year };

      regions.forEach((region) => {
        const regionData = statsResult.recordset.find(
          (r) => r.Year === year && r.EducationRegion === region
        );
        row[region] = regionData ? regionData.WorkshopCount : 0;
      });

      const otherData = statsResult.recordset.find(
        (r) => r.Year === year && r.EducationRegion === "Other"
      );
      row["Other"] = otherData ? otherData.WorkshopCount : 0;

      row.total = Object.values(row)
        .filter((value) => typeof value === "number" && value !== row.year)
        .reduce((sum, value) => sum + value, 0);

      data.push(row);
    });

    const headers = ["Year", ...regions, "Other", "Total"];
    const formattedData = data.map((row) => [
      row.year,
      ...regions.map((region) => row[region] || 0),
      row.Other || 0,
      row.total,
    ]);

    res.send({
      code: 0,
      headers,
      data: formattedData,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/report3", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();

    const { startYear, endYear } = req.query;

    if (
      !startYear ||
      !endYear ||
      isNaN(startYear) ||
      isNaN(endYear) ||
      parseInt(startYear) > parseInt(endYear)
    ) {
      return res.status(400).send({
        code: 1,
        message:
          "Start year and end year are required and must be valid numbers, with startYear less than or equal to endYear.",
      });
    }

    const start = parseInt(startYear);
    const end = parseInt(endYear);

    const startDate = new Date(start, 0, 1);
    const endDate = new Date(end + 1, 0, 1);

    const workshopQuery = `
      SELECT 
        SchoolName,
        YEAR(CreateDate) AS Year,
        COUNT(*) AS WorkshopCount
      FROM [tblStudentInfo] 
      WHERE (IsDeleted IS NULL OR IsDeleted = 0) 
        AND CreateDate >= @StartDate 
        AND CreateDate < @EndDate
      GROUP BY SchoolName, YEAR(CreateDate)
    `;

    const enrollmentQuery = `
      SELECT 
        School,
        YEAR(CreateDate) AS Year,
        COUNT(*) AS EnrollmentCount
      FROM [enrollment] 
      WHERE (IsDeleted IS NULL OR IsDeleted = 0) 
        AND CreateDate >= @StartDate 
        AND CreateDate < @EndDate
      GROUP BY School, YEAR(CreateDate)
    `;

    request.input("StartDate", sql.DateTime2, startDate);
    request.input("EndDate", sql.DateTime2, endDate);

    const workshopResult = await request.query(workshopQuery);
    const enrollmentResult = await request.query(enrollmentQuery);

    const combinedMap = new Map();
    workshopResult.recordset.forEach((record) => {
      const key = `${record.SchoolName}-${record.Year}`;
      const totalCount = combinedMap.get(key)?.TotalCount || 0;
      combinedMap.set(key, {
        SchoolName: record.SchoolName,
        Year: record.Year,
        TotalCount: totalCount + record.WorkshopCount,
      });
    });

    enrollmentResult.recordset.forEach((record) => {
      const key = `${record.School}-${record.Year}`;
      const totalCount = combinedMap.get(key)?.TotalCount || 0;
      combinedMap.set(key, {
        SchoolName: record.School,
        Year: record.Year,
        TotalCount: totalCount + record.EnrollmentCount,
      });
    });

    const formattedData = Array.from(combinedMap.values()).map(
      ({ SchoolName, Year, TotalCount }) => {
        return [SchoolName, Year, TotalCount];
      }
    );

    const headers = ["School Name", "Year", "Total"];

    res.send({
      code: 0,
      headers,
      data: formattedData,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/report4", isAuthenticated, async function (req, res, next) {
  try {
    // if (!req?.admin) {
    //   return res.send({ code: 403, message: "no permission" });
    // }
    const pool = await getPool();
    const request = await pool.request();

    // Get school name and year from request parameters
    const { schoolName, year } = req.query;

    // Validate input
    if (!schoolName || !year || isNaN(year)) {
      return res.status(400).send({
        code: 1,
        message:
          "School name and year are required, and year must be a valid number.",
      });
    }

    // Parse the year parameter
    const parsedYear = parseInt(year);

    // Query to get learners for the specified school and year
    const query = `
      SELECT 
        wr.FirstName,
        wr.LastName,
        wr.DateOfBirth AS DOB,
        wr.Gender,
        wr.Ethnicity,
        wr.Email
        FROM [tblStudentInfo] wr
        WHERE wr.SchoolName = @SchoolName 
        AND (wr.IsDeleted IS NULL OR wr.IsDeleted = 0) 
        AND YEAR(wr.CreateDate) = @Year
    `;

    const enrollmentQuery = `
    SELECT 
      e.FirstName,
      e.LastName,
      e.DateOfBirth as DOB,
      e.Gender,
      e.Ethnicity,
      e.Email
      FROM [enrollment] e
      WHERE e.School = @SchoolName 
      AND (e.IsDeleted IS NULL OR e.IsDeleted = 0) 
      AND YEAR(e.CreateDate) = @Year
  `;

    request.input("SchoolName", sql.VarChar, schoolName);
    request.input("Year", sql.Int, parsedYear);

    const result = await request.query(query);

    const enrollment = await request.query(enrollmentQuery);
    // Prepare the response format
    const learners = [...result.recordset, ...enrollment.recordset]?.map(
      (record) => ({
        LearnerName: `${record.FirstName} ${record.LastName}`,
        DOB: record.DOB,
        Gender: record.Gender,
        Ethnicity: record.Ethnicity,
        Email: record.Email,
      })
    );

    // Return the response with headers and data
    res.send({
      code: 0,
      schoolName: schoolName,
      year: parsedYear,
      headers: ["Learner Name", "DOB", "Gender", "Ethnicity", "Email"],
      data: learners,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/report5", async function (req, res, next) {
  try {
    // if (!req?.admin) {
    //   return res.send({ code: 403, message: "no permission" });
    // }
    const pool = await getPool();
    const request = await pool.request();

    // Get the start year and end year parameters from the request
    const { startYear, endYear } = req.query;

    // Validate input
    if (
      !startYear ||
      !endYear ||
      isNaN(startYear) ||
      isNaN(endYear) ||
      parseInt(startYear) > parseInt(endYear)
    ) {
      return res.status(400).send({
        code: 1,
        message:
          "Start year and end year are required and must be valid numbers, with startYear less than or equal to endYear.",
      });
    }

    // Parse the year range
    const start = parseInt(startYear);
    const end = parseInt(endYear);

    // Query to get the number of learners for each tutor from both tables
    const query = `
      SELECT 
        e.Tutor,
        YEAR(e.CreateDate) AS Year,
        COUNT(e.EnrollmentID) AS LearnerCount
      FROM [enrollment] e
      WHERE YEAR(e.CreateDate) BETWEEN @StartYear AND @EndYear 
      AND (IsDeleted IS NULL OR IsDeleted = 0) 
      AND e.Tutor IS NOT NULL AND e.Tutor <> ''
      GROUP BY e.Tutor, YEAR(e.CreateDate)

      UNION ALL

      SELECT 
        w.Tutor,
        YEAR(wr.CreateDate) AS Year,
        COUNT(*) AS LearnerCount 
      FROM 
        [tblStudentInfo] wr
      LEFT OUTER JOIN 
        tblWorkshop w ON w.Code = wr.Code
      WHERE 
        YEAR(wr.CreateDate) BETWEEN @StartYear AND @EndYear
        AND (wr.IsDeleted IS NULL OR wr.IsDeleted = 0) 
        AND (w.Tutor IS NOT NULL AND w.Tutor <> '')
      GROUP BY 
        w.Tutor, YEAR(wr.CreateDate)
    `;

    request.input("StartYear", sql.Int, start);
    request.input("EndYear", sql.Int, end);

    const result = await request.query(query);

    // Prepare the data format
    const dataMap = new Map();

    result.recordset.forEach((record) => {
      const totalKey = record.Tutor;

      // Initialize if not already present
      if (!dataMap.has(totalKey)) {
        dataMap.set(totalKey, {
          Tutor: totalKey,
          Total: 0, // Initialize total for the tutor
        });
      }

      const tutorData = dataMap.get(totalKey);
      tutorData[record.Year] =
        (tutorData[record.Year] || 0) + record.LearnerCount; // Add learner count for the year
      tutorData.Total += record.LearnerCount; // Update total
    });

    const data = Array.from(dataMap.values()).map((tutor) => {
      const row = [
        tutor.Tutor,
        ...Array.from(
          { length: end - start + 1 },
          (_, i) => tutor[start + i] || 0
        ),
        tutor.Total,
      ];
      return row;
    });

    // Prepare headers
    const headers = [
      "Tutor Name",
      ...Array.from({ length: end - start + 1 }, (_, i) => start + i),
      "Total",
    ];

    // Return the response with headers
    res.send({
      code: 0,
      headers,
      data,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/report6", isAuthenticated, async function (req, res, next) {
  try {
    // if (!req?.admin) {
    //   return res.send({ code: 403, message: "no permission" });
    // }
    const pool = await getPool();
    const request = await pool.request();

    // Get the start year and end year parameters from the request
    const { startYear, endYear } = req.query;

    // Validate input
    if (
      !startYear ||
      !endYear ||
      isNaN(startYear) ||
      isNaN(endYear) ||
      parseInt(startYear) > parseInt(endYear)
    ) {
      return res.status(400).send({
        code: 1,
        message:
          "Start year and end year are required and must be valid numbers, with startYear less than or equal to endYear.",
      });
    }

    // Input the year range to the query
    const start = parseInt(startYear);
    const end = parseInt(endYear);

    // Query to get learner counts by ethnicity from enrollment
    const enrollmentQuery = `
      SELECT
        e.Ethnicity,
        YEAR(e.CreateDate) AS Year,
        COUNT(e.EnrollmentID) AS LearnerCount
      FROM enrollment e
      WHERE YEAR(e.CreateDate) BETWEEN @StartYear AND @EndYear
      AND (e.IsDeleted IS NULL OR e.IsDeleted = 0) 
      GROUP BY e.Ethnicity, YEAR(e.CreateDate)
    `;

    // Query to get learner counts by ethnicity from workshop results
    const workshopQuery = `
      SELECT
        wr.Ethnicity,
        YEAR(wr.CreateDate) AS Year,
        COUNT(wr.StudentID) AS LearnerCount
      FROM tblStudentInfo wr
      WHERE YEAR(wr.CreateDate) BETWEEN @StartYear AND @EndYear
      AND (wr.IsDeleted IS NULL OR wr.IsDeleted = 0) 
      GROUP BY wr.Ethnicity, YEAR(wr.CreateDate)
    `;

    request.input("StartYear", sql.Int, start);
    request.input("EndYear", sql.Int, end);

    const enrollmentResult = await request.query(enrollmentQuery);
    const workshopResult = await request.query(workshopQuery);

    // Prepare the data format from both results
    const dataMap = new Map();

    // Process enrollment data
    enrollmentResult.recordset.forEach((record) => {
      const totalKey = record.Ethnicity;

      if (!dataMap.has(totalKey)) {
        dataMap.set(totalKey, {
          Ethnicity: totalKey,
          Total: 0, // Initialize total for the ethnicity
        });
      }

      const ethnicityData = dataMap.get(totalKey);
      ethnicityData[record.Year] = record.LearnerCount; // Add learner count for the year
      ethnicityData.Total += record.LearnerCount; // Update total
    });

    // Process workshop data
    workshopResult.recordset.forEach((record) => {
      const totalKey = record.Ethnicity;

      if (!dataMap.has(totalKey)) {
        dataMap.set(totalKey, {
          Ethnicity: totalKey,
          Total: 0, // Initialize total for the ethnicity
        });
      }

      const ethnicityData = dataMap.get(totalKey);
      ethnicityData[record.Year] =
        (ethnicityData[record.Year] || 0) + record.LearnerCount; // Add learner count for the year
      ethnicityData.Total += record.LearnerCount; // Update total
    });

    const data = Array.from(dataMap.values()).map((ethnicity) => {
      const row = [
        ethnicity.Ethnicity,
        ...Array.from(
          { length: end - start + 1 },
          (_, i) => ethnicity[start + i] || 0
        ),
        ethnicity.Total,
      ];
      return row;
    });

    // Prepare headers
    const headers = [
      "Ethnicity",
      ...Array.from({ length: end - start + 1 }, (_, i) => start + i),
      "Total",
    ];

    // Return the response with headers
    res.send({
      code: 0,
      headers,
      data,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/studentreport", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();
    
    const current = Number(req.query.current || 1);
    const isReport = Number(req.query.isReport || 0);
    const pageSize = Number(req.query.pageSize || 10);
    const startIndex = (current - 1) * pageSize;
    
    // Fix 1: Handle undefined dyquery safely
    const dyquery = req.query.dyquery || '';
    
    // Fix 2: Add proper WHERE clause handling
    const whereClause = dyquery ? `AND ${dyquery}` : '';
    
    const query = `SELECT COUNT(SIC.ID) TotalCourse, ISNULL(SIC.CourseStatus,'On Going') CourseStatus
                  FROM [dbo].[tblStudentInfo] S
                  LEFT JOIN [dbo].[tblStudentInCourse] SIC ON S.StudentID = SIC.StudentID
                  WHERE ISNULL(S.IsDeleted, 0) = 0 ${whereClause}
                  GROUP BY SIC.CourseStatus;
                  
                  WITH FilteredStudentsPaged AS (
                    SELECT 
                    S.StudentID, Email, FirstName, LastName, DateOfBirth, Gender, Ethnicity, PhoneNumber, School, Fees, StreetAddress, City, Region, Tutor, Status, S.IsDeleted, TutorId, COUNT(SIC.ID) TotalCourse
                    , ROW_NUMBER() OVER (ORDER BY S.StudentID) AS RowNum
                    FROM [dbo].[tblStudentInfo] S
                    LEFT JOIN [dbo].[tblStudentInCourse] SIC ON S.StudentID = SIC.StudentID
                    WHERE ISNULL(S.IsDeleted, 0) = 0 ${whereClause}
                    GROUP BY S.StudentID, Email, FirstName, LastName, DateOfBirth, Gender, Ethnicity, PhoneNumber, School, Fees, StreetAddress, City, Region, Tutor, Status, S.IsDeleted, TutorId
                  )
                  SELECT *
                  FROM FilteredStudentsPaged
                  WHERE (@isReport = 1 OR RowNum BETWEEN @startIndex + 1 AND @startIndex + @pageSize)
                  ORDER BY FirstName, LastName;
                  
                  WITH FilteredStudents AS (
                    SELECT 
                    S.StudentID, Email, FirstName, LastName, DateOfBirth, Gender, Ethnicity, PhoneNumber, School, Fees, StreetAddress, City, Region, Tutor, Status, S.IsDeleted, TutorId, COUNT(SIC.ID) TotalCourse
                    FROM [dbo].[tblStudentInfo] S
                    LEFT JOIN [dbo].[tblStudentInCourse] SIC ON S.StudentID = SIC.StudentID
                    WHERE ISNULL(S.IsDeleted, 0) = 0 ${whereClause}
                    GROUP BY S.StudentID, Email, FirstName, LastName, DateOfBirth, Gender, Ethnicity, PhoneNumber, School, Fees, StreetAddress, City, Region, Tutor, Status, S.IsDeleted, TutorId
                  )
                  SELECT COUNT(*) AS totalRows
                  FROM FilteredStudents;
                  `;

    console.log("query");
    console.log(query);

    request.input("startIndex", sql.Int, startIndex);
    request.input("pageSize", sql.Int, pageSize);
    request.input("isReport", sql.Int, isReport);
    

    // Fix 3: Use async/await instead of callback
    const result = await request.query(query);
    
    if (result?.recordsets && result.recordsets.length > 0) {
        const total = result.recordsets[2][0].totalRows;
      
      return res.send({
        code: 0,
        data: result.recordsets,
        pagination: getPagination(current, pageSize, total),
      });
    }
    
    return res.send({ 
      code: 0, 
      data: [], 
      pagination: null 
    });
    
  } catch (error) {
    console.error('Error in studentreport:', error);
    next(error);
  }
});

router.get("/report7", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();

    // Get parameters
    const { fields, startYear, endYear, status, assignedTo, schools, tutors, regions, ethnicities } = req.query;

    // Validate fields parameter
    if (!fields) {
      return res.status(400).send({
        code: 1,
        message: "Fields parameter is required",
      });
    }

    // Parse the selected fields
    const selectedFields = fields.split(',').map(f => f.trim());

    // Validate all fields are allowed
    const allowedFields = [
      'StudentID', 'FirstName', 'LastName', 'Email', 'PhoneNumber',
      'DateOfBirth', 'Gender', 'Ethnicity', 'School', 'SchoolNumber',
      'Tutor', 'Status', 'AssignedTo', 'Fees', 'Region', 'City',
      'StreetAddress', 'Zipcode', 'CreateDate', 'WorkbookOption',
      'TeacherName', 'TeacherEmail', 'InvoiceEmail',
      // Course enrollment fields
      'CourseName', 'CourseLevel', 'CourseCredits', 'CourseType',
      'CourseStatus', 'EnrollmentDate', 'LearnerType'
    ];

    const invalidFields = selectedFields.filter(f => !allowedFields.includes(f));
    if (invalidFields.length > 0) {
      return res.status(400).send({
        code: 1,
        message: `Invalid fields: ${invalidFields.join(', ')}`,
      });
    }

    // Build the SELECT clause with selected fields and proper table aliases
    const selectClause = selectedFields.map(field => {
      // Map course enrollment fields to correct tables
      if (['CourseName', 'CourseLevel', 'CourseCredits'].includes(field)) {
        return `c.${field}`;
      } else if (['CourseType', 'CourseStatus', 'LearnerType'].includes(field)) {
        return `sic.${field}`;
      } else if (field === 'EnrollmentDate') {
        return 'sic.CreatDate as EnrollmentDate';
      } else {
        // Student info fields
        return `s.${field}`;
      }
    }).join(', ');

    // Determine if we need to join course tables
    const needsCourseJoin = selectedFields.some(f =>
      ['CourseName', 'CourseLevel', 'CourseCredits', 'CourseType', 'CourseStatus', 'EnrollmentDate', 'LearnerType'].includes(f)
    );

    // Build WHERE clause based on filters
    let whereConditions = ['(s.IsDeleted IS NULL OR s.IsDeleted = 0)'];

    if (startYear && endYear) {
      const start = parseInt(startYear);
      const end = parseInt(endYear);
      const startDate = new Date(start, 0, 1);
      const endDate = new Date(end + 1, 0, 1);

      request.input("StartDate", sql.DateTime2, startDate);
      request.input("EndDate", sql.DateTime2, endDate);
      whereConditions.push('s.CreateDate >= @StartDate AND s.CreateDate < @EndDate');
    }

    if (status) {
      request.input("Status", sql.VarChar, status);
      whereConditions.push('s.Status = @Status');
    }

    if (assignedTo) {
      request.input("AssignedTo", sql.VarChar, assignedTo);
      whereConditions.push('s.AssignedTo = @AssignedTo');
    }

    // Handle multi-select filters
    if (schools) {
      const schoolList = schools.split(',').map(s => s.trim()).filter(s => s);
      console.log('Filtering by schools:', schoolList);
      if (schoolList.length > 0) {
        const schoolConditions = schoolList.map((school, idx) => {
          const paramName = `School${idx}`;
          request.input(paramName, sql.VarChar, school);
          return `LOWER(RTRIM(LTRIM(s.School))) = LOWER(RTRIM(LTRIM(@${paramName})))`;
        });
        whereConditions.push(`(${schoolConditions.join(' OR ')})`);
      }
    }

    if (tutors) {
      const tutorList = tutors.split(',').map(t => t.trim()).filter(t => t);
      console.log('Filtering by tutors:', tutorList);
      if (tutorList.length > 0) {
        const tutorConditions = tutorList.map((tutor, idx) => {
          const paramName = `Tutor${idx}`;
          request.input(paramName, sql.VarChar, tutor);
          return `LOWER(RTRIM(LTRIM(s.Tutor))) = LOWER(RTRIM(LTRIM(@${paramName})))`;
        });
        whereConditions.push(`(${tutorConditions.join(' OR ')})`);
      }
    }

    if (regions) {
      const regionList = regions.split(',').map(r => r.trim()).filter(r => r);
      console.log('Filtering by regions:', regionList);
      if (regionList.length > 0) {
        const regionConditions = regionList.map((region, idx) => {
          const paramName = `Region${idx}`;
          request.input(paramName, sql.VarChar, region);
          return `LOWER(RTRIM(LTRIM(s.Region))) = LOWER(RTRIM(LTRIM(@${paramName})))`;
        });
        whereConditions.push(`(${regionConditions.join(' OR ')})`);
      }
    }

    if (ethnicities) {
      const ethnicityList = ethnicities.split(',').map(e => e.trim()).filter(e => e);
      console.log('Filtering by ethnicities:', ethnicityList);
      if (ethnicityList.length > 0) {
        const ethnicityConditions = ethnicityList.map((ethnicity, idx) => {
          const paramName = `Ethnicity${idx}`;
          request.input(paramName, sql.VarChar, ethnicity);
          return `LOWER(RTRIM(LTRIM(s.Ethnicity))) = LOWER(RTRIM(LTRIM(@${paramName})))`;
        });
        whereConditions.push(`(${ethnicityConditions.join(' OR ')})`);
      }
    }

    // New course-related filters
    const { courseNames, courseTypes, courseStatuses, courseLevels } = req.query;

    if (courseNames) {
      const courseNameList = courseNames.split(',').map(cn => cn.trim()).filter(cn => cn);
      console.log('Filtering by course names:', courseNameList);
      if (courseNameList.length > 0) {
        const courseNameConditions = courseNameList.map((courseName, idx) => {
          const paramName = `CourseName${idx}`;
          request.input(paramName, sql.VarChar, courseName);
          return `LOWER(RTRIM(LTRIM(c.CourseName))) = LOWER(RTRIM(LTRIM(@${paramName})))`;
        });
        whereConditions.push(`(${courseNameConditions.join(' OR ')})`);
      }
    }

    if (courseTypes) {
      const courseTypeList = courseTypes.split(',').map(ct => ct.trim()).filter(ct => ct);
      console.log('Filtering by course types:', courseTypeList);
      if (courseTypeList.length > 0) {
        const courseTypeConditions = courseTypeList.map((courseType, idx) => {
          const paramName = `CourseType${idx}`;
          request.input(paramName, sql.VarChar, courseType);
          return `sic.CourseType = @${paramName}`;
        });
        whereConditions.push(`(${courseTypeConditions.join(' OR ')})`);
      }
    }

    if (courseStatuses) {
      const courseStatusList = courseStatuses.split(',').map(cs => cs.trim()).filter(cs => cs);
      console.log('Filtering by course statuses:', courseStatusList);
      if (courseStatusList.length > 0) {
        const courseStatusConditions = courseStatusList.map((courseStatus, idx) => {
          const paramName = `CourseStatus${idx}`;
          request.input(paramName, sql.VarChar, courseStatus);
          return `sic.CourseStatus = @${paramName}`;
        });
        whereConditions.push(`(${courseStatusConditions.join(' OR ')})`);
      }
    }

    if (courseLevels) {
      const courseLevelList = courseLevels.split(',').map(cl => cl.trim()).filter(cl => cl);
      console.log('Filtering by course levels:', courseLevelList);
      if (courseLevelList.length > 0) {
        const courseLevelConditions = courseLevelList.map((courseLevel, idx) => {
          const paramName = `CourseLevel${idx}`;
          request.input(paramName, sql.Int, parseInt(courseLevel));
          return `c.CourseLevel = @${paramName}`;
        });
        whereConditions.push(`(${courseLevelConditions.join(' OR ')})`);
      }
    }

    const whereClause = whereConditions.join(' AND ');

    // Build and execute the query with conditional JOINs
    let query;
    if (needsCourseJoin) {
      query = `
        SELECT ${selectClause}
        FROM tblStudentInfo s
        LEFT JOIN tblStudentInCourse sic ON s.StudentID = sic.StudentID
        LEFT JOIN tblCourse c ON sic.CourseID = c.CourseID
        WHERE ${whereClause}
        ORDER BY s.StudentID, sic.CreatDate DESC
      `;
    } else {
      query = `
        SELECT ${selectClause}
        FROM tblStudentInfo s
        WHERE ${whereClause}
        ORDER BY s.CreateDate DESC
      `;
    }

    console.log('Report7 SQL Query:', query);
    console.log('WHERE clause:', whereClause);

    const result = await request.query(query);

    console.log(`Report7 returned ${result.recordset.length} records`);

    res.send({
      code: 0,
      data: result.recordset || [],
    });
  } catch (error) {
    console.error('Error in report7:', error);
    next(error);
  }
});

router.get("/dashboard", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();

    const year = parseInt(req.query.year) || new Date().getFullYear();
    request.input("Year", sql.Int, year);

    // Get total students
    const totalStudentsQuery = `
      SELECT COUNT(*) AS total
      FROM tblStudentInfo
      WHERE (IsDeleted IS NULL OR IsDeleted = 0)
    `;

    // Get total workshops
    const totalWorkshopsQuery = `
      SELECT COUNT(*) AS total
      FROM tblWorkshop
      WHERE YEAR(CourseDate) = @Year
    `;

    // Get active students
    const activeStudentsQuery = `
      SELECT COUNT(*) AS total
      FROM tblStudentInfo
      WHERE (IsDeleted IS NULL OR IsDeleted = 0)
        AND (Status = 'On Going' OR Status IS NULL)
    `;

    // Get total courses
    const totalCoursesQuery = `
      SELECT COUNT(DISTINCT CourseID) AS total
      FROM tblStudentInCourse
    `;

    // Get monthly registrations for the year
    const monthlyRegistrationsQuery = `
      SELECT
        MONTH(CreateDate) AS Month,
        COUNT(*) AS Count
      FROM tblStudentInfo
      WHERE YEAR(CreateDate) = @Year
        AND (IsDeleted IS NULL OR IsDeleted = 0)
      GROUP BY MONTH(CreateDate)
      ORDER BY MONTH(CreateDate)
    `;

    // Get monthly workshops for the year
    const monthlyWorkshopsQuery = `
      SELECT
        MONTH(CourseDate) AS Month,
        COUNT(*) AS Count
      FROM tblWorkshop
      WHERE YEAR(CourseDate) = @Year
      GROUP BY MONTH(CourseDate)
      ORDER BY MONTH(CourseDate)
    `;

    // Get assignment distribution (School vs GET Group) by month
    const assignmentDistributionQuery = `
      SELECT
        MONTH(CreateDate) AS Month,
        AssignedTo,
        COUNT(*) AS Count
      FROM tblStudentInfo
      WHERE YEAR(CreateDate) = @Year
        AND (IsDeleted IS NULL OR IsDeleted = 0)
        AND AssignedTo IN ('School', 'GET Group')
      GROUP BY MONTH(CreateDate), AssignedTo
      ORDER BY MONTH(CreateDate)
    `;

    // Get ethnicity breakdown
    const ethnicityBreakdownQuery = `
      SELECT
        ISNULL(Ethnicity, 'Unknown') AS Ethnicity,
        COUNT(*) AS Count
      FROM tblStudentInfo
      WHERE (IsDeleted IS NULL OR IsDeleted = 0)
        AND YEAR(CreateDate) = @Year
      GROUP BY Ethnicity
      ORDER BY COUNT(*) DESC
    `;

    // Execute all queries in parallel
    const [
      totalStudentsResult,
      totalWorkshopsResult,
      activeStudentsResult,
      totalCoursesResult,
      monthlyRegistrationsResult,
      monthlyWorkshopsResult,
      assignmentDistributionResult,
      ethnicityBreakdownResult
    ] = await Promise.all([
      request.query(totalStudentsQuery),
      request.query(totalWorkshopsQuery),
      request.query(activeStudentsQuery),
      request.query(totalCoursesQuery),
      request.query(monthlyRegistrationsQuery),
      request.query(monthlyWorkshopsQuery),
      request.query(assignmentDistributionQuery),
      request.query(ethnicityBreakdownQuery)
    ]);

    // Process monthly registrations
    const monthNames = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];

    const monthlyRegistrations = monthNames.map((month, index) => {
      const record = monthlyRegistrationsResult.recordset.find(r => r.Month === index + 1);
      return {
        month,
        count: record ? record.Count : 0
      };
    });

    // Process monthly workshops
    const monthlyWorkshops = monthNames.map((month, index) => {
      const record = monthlyWorkshopsResult.recordset.find(r => r.Month === index + 1);
      return {
        month,
        count: record ? record.Count : 0
      };
    });

    // Process assignment distribution
    const assignmentDistribution = monthNames.map((month, index) => {
      const schoolRecord = assignmentDistributionResult.recordset.find(
        r => r.Month === index + 1 && r.AssignedTo === 'School'
      );
      const getGroupRecord = assignmentDistributionResult.recordset.find(
        r => r.Month === index + 1 && r.AssignedTo === 'GET Group'
      );

      return {
        month,
        school: schoolRecord ? schoolRecord.Count : 0,
        getGroup: getGroupRecord ? getGroupRecord.Count : 0
      };
    });

    // Process ethnicity breakdown
    const totalEthnicityCount = ethnicityBreakdownResult.recordset.reduce(
      (sum, record) => sum + record.Count, 0
    );

    const ethnicityBreakdown = ethnicityBreakdownResult.recordset.map(record => ({
      ethnicity: record.Ethnicity,
      count: record.Count,
      percent: totalEthnicityCount > 0 ? (record.Count / totalEthnicityCount) * 100 : 0
    }));

    // Send response
    res.send({
      code: 0,
      data: {
        totalStudents: totalStudentsResult.recordset[0].total,
        totalWorkshops: totalWorkshopsResult.recordset[0].total,
        activeStudents: activeStudentsResult.recordset[0].total,
        totalCourses: totalCoursesResult.recordset[0].total,
        monthlyRegistrations,
        monthlyWorkshops,
        assignmentDistribution,
        ethnicityBreakdown
      }
    });
  } catch (error) {
    console.error('Error in dashboard:', error);
    next(error);
  }
});


module.exports = router;
