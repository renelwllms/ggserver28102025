const express = require("express");
const router = express.Router();
const fs = require('fs');
const isAuthenticated = require("./auth");
const path = require("path");
const {
  generateCertificate,
  generateCertificates,
  generateAllCertificates,
  generateCertificateMicro,
  generateAllPdfCertificates,
} = require("../generateCertificate/index");

const { generateRemotLearneResult, generateWorkshopResult } = require("../GenerateResult/index");

const sql = require("mssql");
const moment = require("moment");
const { getPool } = require("./utils");
const logger = require("../log/logger");

const axios = require("axios");
const { stringify } = require("qs");
const sendMailUrl =
  "https://graph.microsoft.com/v1.0/users/Admin@thegetgroup.co.nz/sendMail";
const clientId = "e8d3a4a4-2922-44fa-8487-dc994f065e56";
const clientSecret = "qqe8Q~cf4EQWYmWOcuX5qUGqbcSAk9gDK8Ohtbxo";

async function getToken() {
  const tokenUrl =
    "https://login.microsoftonline.com/807cd602-32e3-4a35-a30e-2ac56ecf53d6/oauth2/v2.0/token";

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
// isAuthenticated
// Email sending interface
router.post("/send", isAuthenticated, async function (req, res, next) {
  logger.info("Start Send");
  const accessToken = await getToken();
  logger.info(`Generate access token`);
  try {
    const pool = await getPool();
    logger.info(`Get poool`);
    const request = await pool.request();
    logger.info(`Open pool request`);
    const Code = req.body.Code;
    const emailAddress = req.body.email;
    const WorkshopResultID = Number(req.body.WorkshopResultID | 0);
    const StudentID = Number(req.body.EnrollmentID);
    logger.info(`Extract parameter from body`);

    if (!emailAddress) {
      return res.status(400).send({
        code: 1,
        message: "Please select",
      });
    }

    logger.info(`Start query building`);
    let query = "";

    if (Code) {
      request.input("Code", sql.VarChar, Code);
      query = `
      DECLARE @jsonResult NVARCHAR(MAX)
       SELECT @jsonResult  = ISNULL(wsr.Result, '{}') FROM tblStudentInfo wsr
       WHERE wsr.Code = @Code AND (wsr.IsDeleted IS NULL OR wsr.IsDeleted = 0) AND (@WorkshopResultID = 0 OR wsr.StudentID = @WorkshopResultID);
       SELECT CONVERT(int, [key]) Id INTO #allCourse FROM  OPENJSON(@jsonResult) WHERE [key] <> 'Course';
       WITH cus AS (
           SELECT * FROM tblCourseUnitStandard WHERE CourseID = (SELECT CourseID FROM tblWorkshop WHERE Code = @Code) AND UnitStandardID IN (SELECT Id FROM #allCourse)
       )
       SELECT us.* FROM  cus LEFT OUTER JOIN tblUnitStandard us ON cus.UnitStandardID = us.UnitStandardID
       SELECT wsr.*,ws.CourseName  FROM tblStudentInfo wsr
       LEFT OUTER JOIN tblWorkshop ws ON ws.Code = wsr.Code
       WHERE wsr.Code = @Code
       AND (wsr.IsDeleted IS NULL OR wsr.IsDeleted = 0)
       `;

      request.input("WorkshopResultID", sql.Int, WorkshopResultID);
      if (WorkshopResultID) {
        query += "AND (@WorkshopResultID = 0 OR wsr.StudentID = @WorkshopResultID);";
      }
      query += " DROP TABLE #allCourse; "
    } else {
      request.input("StudentID", sql.Int, StudentID);
      query = `
      WITH cus AS (
          SELECT * FROM tblCourseUnitStandard WHERE CourseID = (SELECT CourseID FROM tblStudentInfo WHERE StudentID = @StudentID)
       )
       SELECT us.* FROM  cus LEFT OUTER JOIN tblUnitStandard us ON cus.UnitStandardID = us.UnitStandardID
       SELECT * FROM tblStudentInfo WHERE StudentID = @StudentID
       `;
    }

    logger.info(`Query : ${query}`);
    logger.info(`End query building`);
    await request.query(query, async (err, result) => {
      if (err) console.log(err);
      if (!result?.recordset) {
        return res.send({
          code: 1,
          data: "No Data",
        });
      }
      const d = result.recordsets;
      const items = d[0].map((e) => {
        return {
          US: e.US,
          Description: e.USName,
          Value: e.USCredits,
          Level: e.USLevel,
          id: e.UnitStandardID,
        };
      });

      const students = d[1]
        .filter((item) => {
          if (!item.Result) return false;
          const d = JSON.parse(item.Result);
          if (!d?.Course || d?.Course === "Not Yet Achieved") {
            return false;
          }
          return true;
        })
        .map((e) => {
          const resultData = JSON.parse(e.Result);
          const filter = Object.keys(resultData).filter(key => resultData[key] !== "Not Yet Achieved" && key !== "Course").map(Number);
          return {
            learnerName: `${e.FirstName} ${e.LastName}`,
            learner: `${e.FirstName} ${e.LastName}`,
            date: moment().format("DD MMMM YYYY"),
            course: e.CourseName,
            items: items.filter(item => filter.includes(item.id)),
            // rawitems: items,
            // result: filter,
          };
        });

      if (!students.length) {
        return res.send({ code: 1, data: "error" });
      }

      logger.info(`Start generate certificate`);
      const attachments = WorkshopResultID > 0 ? await generateCertificate(students) : await generateCertificates(students);
      logger.info(`End certificate generate`);

      //res.send({ code: 1, data: "error" });

      const subject1 = students.map((e) => e.learner).join(",");
      const mailOptions = {
        message: {
          subject: `Certificate of Achievement for ${subject1}`,
          body: {
            contentType: "Text",
            content: "Please see the attached Certificate of Achievement.",
          },
          toRecipients: [
            {
              emailAddress: {
                address: emailAddress,
              },
            },
          ],
          attachments,
        },
      };

      const response = await axios.post(sendMailUrl, mailOptions, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });
      if (response?.statusText === "Accepted" || response?.status === 202) {
        res.send({ code: 0, data: "success" });
      } else {
        res.send({ code: 1, data: "error" });
      }
    });
  } catch (error) {
    next(error);
  }
});


router.get("/downloadCertificate", async (req, res) => {
  try {
    const { fileName } = req.query;
    const pdfFileName = fileName || "";
    const pdfPath = path.join(__dirname, "..", "generateCertificate", pdfFileName);

    logger.info(`Preparing to download PDF: ${pdfPath}`);

    // Check if file exists
    if (!fs.existsSync(pdfPath)) {
      logger.error(`Certificate file not found: ${pdfPath}`);
      return res.status(404).json({
        code: 1,
        message: "Certificate file not found. Please ensure the certificate has been generated.",
        error: "FILE_NOT_FOUND"
      });
    }

    // Multiple approaches to get file size (Windows compatibility)
    let fileSize = null;
    let stat = null;

    // Method 1: Try fs.statSync
    try {
      stat = fs.statSync(pdfPath);
      fileSize = stat.size;
      logger.info("Method 1 - fs.statSync size:", fileSize);
    } catch (statError) {
      logger.warn("fs.statSync failed:", statError.message);
    }

    // Method 2: If stat.size is null/undefined, try alternative approaches
    if (!fileSize || fileSize === 0) {
      try {
        // Try reading file descriptor
        const fd = fs.openSync(pdfPath, 'r');
        const fdStat = fs.fstatSync(fd);
        fileSize = fdStat.size;
        fs.closeSync(fd);
        logger.info("Method 2 - fstatSync size:", fileSize);
      } catch (fdError) {
        logger.warn("fstatSync failed:", fdError.message);
      }
    }

    // Method 3: If still no size, read file buffer length
    if (!fileSize || fileSize === 0) {
      try {
        const buffer = fs.readFileSync(pdfPath);
        fileSize = buffer.length;
        logger.info("Method 3 - buffer length:", fileSize);
      } catch (bufferError) {
        logger.warn("Buffer read failed:", bufferError.message);
      }
    }

    // Method 4: Use promises-based approach (more reliable on Windows)
    if (!fileSize || fileSize === 0) {
      try {
        const { promisify } = require('util');
        const statAsync = promisify(fs.stat);
        const asyncStat = await statAsync(pdfPath);
        fileSize = asyncStat.size;
        logger.info("Method 4 - async stat size:", fileSize);
      } catch (asyncError) {
        logger.warn("Async stat failed:", asyncError.message);
      }
    }

    // Set headers
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${pdfFileName}"`);
    
    // Only set Content-Length if we have a valid size
    if (fileSize && fileSize > 0) {
      res.setHeader("Content-Length", fileSize);
      logger.info("Content-Length successfully set to:", fileSize);
    } else {
      logger.warn("Could not determine file size, proceeding without Content-Length header");
      // Note: This is actually fine - browsers can handle downloads without Content-Length
    }

    // Log additional file information for debugging
    if (stat) {
      logger.info("Additional file info:", {
        isFile: stat.isFile ? stat.isFile() : 'unknown',
        isDirectory: stat.isDirectory ? stat.isDirectory() : 'unknown',
        birthtime: stat.birthtime,
        mtime: stat.mtime,
        mode: stat.mode,
        uid: stat.uid,
        gid: stat.gid
      });
    }

    // Send file
    res.sendFile(path.resolve(pdfPath), (err) => {
      if (err) {
        logger.error("Error sending file:", {
          error: err.message,
          code: err.code,
          path: pdfPath,
          resolved: path.resolve(pdfPath)
        });
        
        if (!res.headersSent) {
          return res.status(500).json({
            code: 1,
            message: "Failed to download certificate",
            error: "FILE_SEND_ERROR"
          });
        }
      } else {
        logger.info("PDF certificate download sent successfully");
      }
    });

  } catch (error) {
    logger.error("Error in /downloadCertificate:", {
      error: error.message,
      stack: error.stack,
      query: req.query
    });
    
    if (!res.headersSent) {
      return res.status(500).json({
        code: 1,
        message: "Failed to process download",
        error: "INTERNAL_SERVER_ERROR"
      });
    }
  }
});



// isAuthenticated
// Email sending interface
router.post("/sendcertificate", isAuthenticated, async function (req, res, next) {
  logger.info("Start Certificate Processing");
  
  try {
    const pool = await getPool();
    logger.info(`Get pool`);
    const request = await pool.request();
    logger.info(`Open pool request`);
    
    const Code = req.body.Code;
    const emailAddress = req.body.email;
    const reportType = Number(req.body.reportType || 0);
    const StudentID = Number(req.body.StudentID || 0);
    const ID = Number(req.body.Id || 0);
    const deliveryMethod = req.body.deliveryMethod || 'email'; // Default to email

    logger.info(`Extract parameter from body`);
    logger.info(`Delivery method: ${deliveryMethod}`);

    // Validate email address only for email delivery
    if (deliveryMethod === 'email' && !emailAddress) {
      return res.status(400).send({
        code: 1,
        message: "Email address is required for email delivery",
      });
    }

    logger.info(`Start query building`);
    let query = `
    SELECT SCU.*, us.* FROM tblStudentInCourseUnitStandard SCU
    INNER JOIN tblUnitStandard us ON SCU.UnitStandardID = us.UnitStandardID
    INNER JOIN tblStudentInCourse C ON SCU.SICId = C.id
    WHERE (@SICId = 0 OR SCU.SICId = @SICId)
      AND (ISNULL(@code, '')  = '' OR C.Code = @code)
      AND (SCU.UnitStatus IS NOT NULL AND SCU.UnitStatus <> '' AND SCU.UnitStatus <> 'Not Yet Achieved');

    SELECT SC.*, C.*, S.*, C.CourseName Course, S.StudentID StdID FROM tblStudentInCourse SC
    INNER JOIN tblCourse C ON SC.CourseID = C.CourseID
    INNER JOIN tblStudentInfo S ON  SC.StudentID = S.StudentID
    WHERE (@SICId = 0 OR SC.Id = @SICId)
      AND (ISNULL(@code, '')  = '' OR SC.Code = @code)
      AND (SC.CourseStatus IS NOT NULL AND SC.CourseStatus <> '' AND SC.CourseStatus <> 'Not Yet Achieved')
    `;

    request.input("Code", sql.VarChar, Code);
    request.input("StudentID", sql.Int, StudentID);
    request.input("SICId", sql.Int, ID);

    logger.info(`End query building`);
    
    const result = await request.query(query);
    
    if (!result?.recordsets || !result.recordsets[0] || !result.recordsets[1]) {
      return res.status(404).send({
        code: 1,
        message: "No Data Found",
      });
    }

    const d = result.recordsets;
    const items = d[0].map((e) => {
      return {
        US: e.US,
        Description: e.USName,
        Value: e.USCredits,
        Level: e.USLevel,
        id: e.UnitStandardID,
        SICId: e.SICId,
        StudentID: e.StudentID,
      };
    });

    let refNo = "";
    let level = "";
    let courseName = "Certificate of Achievement";
    if (reportType == 2) {
      refNo = "5132";
      level = "2";
      courseName = "WORK READY SKILLS";
    }
    else if (reportType == 3) {
      refNo = "4910";
      level = "3";
      courseName = "EMPLOYMENT SKILLS";
    }
    else if (reportType == 4) {
      refNo = "2861";
      level = "1";
      courseName = "FOUNDATION SKILLS";
    }
    else if (reportType == 5) {
      refNo = "2862";
      level = "2";
      courseName = "FOUNDATION SKILLS";
    }

    const maxLineLenth = 30;

    const students = d[1]
      .map((e) => {
        const nameLines = breakStringToArray(`${e.FirstName} ${e.LastName}`, maxLineLenth);
        return {
          nsn: e.NSN || "",
          lv: level,
          ref: refNo,
          learnersecond: nameLines.length > 1 ? nameLines[0] : "",
          learner: nameLines.length > 1 ? nameLines[1] : nameLines[0] || "",
          learnerName: `${e.FirstName} ${e.LastName}`,
          date: moment().format("DD MMMM YYYY"),
          date2: moment().format("DD MMMM YYYY"),
          course: reportType == 1? e.Course:courseName,
          items: reportType < 2 ? items.filter(item => item.SICId == e.id && item.StudentID == e.StdID) : [],
        };
      });

    if (!students.length) {
      return res.status(404).send({ 
        code: 1, 
        message: "No students found" 
      });
    }

    logger.info(`Start Report configuration`);
    let reportName = "";
    let studentNames = students.length > 1 ? Code : students.map((e) => e.learnersecond || e.learner).join(",");
    let subject = "";
    
    if (reportType == 1) {
      reportName = "AchievementCertificatev1";
      subject = `Certificate of Achievement for ${studentNames}`;
    }
    else if (reportType == 2) {
      reportName = "MicroCredentialv1";
      subject = `Work Ready Skills L2 Micro Credential for ${studentNames}`;
    }
    else if (reportType == 3) {
      reportName = "MicroCredentialv1";
      subject = `Employement Skill L3 for ${studentNames}`;
    }
    else if (reportType == 4) {
      reportName = "MicroCredentialv1";
      subject = `Foundation Skills L1 for ${studentNames}`;
    }
    else if (reportType == 5) {
      reportName = "MicroCredentialv1";
      subject = `Foundation Skills L1 for ${studentNames}`;
    }

    logger.info(`End Report configuration`);

    let certificateName = students.length > 1 ? Code : students.map((e) => e.learnersecond || e.learner).join(",");


    // Handle different delivery methods
    if (deliveryMethod === 'download') {
      logger.info(`Start generate certificate for download`);
      
      try {
        // Generate single PDF
        const pdfFileName = await generateAllPdfCertificates(reportName, certificateName, students, reportType);

        if (!pdfFileName) {
          return res.status(500).send({
            code: 1,
            message: "Failed to generate certificate"
          });
        }
        
        const pdfPath = `/api/certificate/downloadCertificate?fileName=${pdfFileName}`;
 
        logger.info(`PDF path`);
        logger.info(pdfPath);
      /*
        res.download(pdfPath, "samplefile.pdf", (err) => {
          if (err) {
            logger.error("Error sending file:", err);
            res.status(500).send({
              code: 1,
              message: "Failed to download certificate"
            });
          }
        });*/

        res.send({ code: 0, data: pdfPath });
        logger.info(`PDF certificate download sent successfully`);
        
      } catch (error) {
        logger.error("Error generating certificate for download:", error);
        return res.status(500).send({
          code: 1,
          message: "Failed to generate certificate for download"
        });
      }
      
    } else {
      // Default email delivery
      logger.info(`Start generate certificate for email`);
      
      const accessToken = await getToken();
      logger.info(`Generate access token`);
      
      const attachments = await generateAllCertificates(reportName, certificateName, students);
      logger.info(`End certificate generate`);
      logger.info(`Generated ${attachments.length} attachments`);

      // Create a nicely formatted email body
      const studentCount = students.length;
      const certificateTypeName = reportType == 1 ? "Certificate of Achievement"
        : reportType == 2 ? "Work Ready Skills L2 Micro-Credential"
        : reportType == 3 ? "Employment Skills L3 Micro-Credential"
        : reportType == 4 ? "Foundation Skills L1"
        : "Foundation Skills L2";

      let emailBody = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #0066cc; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
    .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; border-top: none; }
    .footer { background-color: #f0f0f0; padding: 15px; text-align: center; font-size: 12px; color: #666; border-radius: 0 0 5px 5px; }
    .student-list { background-color: white; padding: 15px; margin: 15px 0; border-left: 4px solid #0066cc; }
    .highlight { color: #0066cc; font-weight: bold; }
    ul { list-style-type: none; padding-left: 0; }
    li { padding: 5px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2 style="margin: 0;">The Get Group - Certificate Delivery</h2>
    </div>
    <div class="content">
      <p>Kia ora,</p>
      <p>Please find attached the <span class="highlight">${certificateTypeName}</span> certificate${studentCount > 1 ? 's' : ''} for:</p>
      ${studentCount > 1 ? `
      <div class="student-list">
        <p><strong>${studentCount} Student${studentCount !== 1 ? 's' : ''}</strong></p>
        <ul>
          ${students.map((s) => `<li>• ${s.learnerName}</li>`).join('')}
        </ul>
      </div>
      ` : `
      <div class="student-list">
        <p><strong>${students[0].learnerName}</strong></p>
      </div>
      `}
      <p>The certificate${studentCount > 1 ? 's are' : ' is'} attached to this email as PDF file${studentCount > 1 ? 's' : ''}.</p>
      <p>If you have any questions or need assistance, please don't hesitate to contact us.</p>
      <p>Ngā mihi,<br>
      <strong>The Get Group Team</strong></p>
    </div>
    <div class="footer">
      <p>This email was automatically generated by The Get Group Portal</p>
    </div>
  </div>
</body>
</html>`;

      const mailOptions = {
        message: {
          subject: subject,
          body: {
            contentType: "HTML",
            content: emailBody,
          },
          toRecipients: [
            {
              emailAddress: {
                address: emailAddress,
              },
            },
          ],
          attachments,
        },
      };

      logger.info(`Start certificate email`);
      logger.info(`Sending email to: ${emailAddress}`);
      logger.info(`Email subject: ${subject}`);
      
      const response = await axios.post(sendMailUrl, mailOptions, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });
      
      logger.info(`Email response status: ${response.status}`);
      logger.info(`Email response statusText: ${response.statusText}`);
      
      if (response?.status === 202 || response?.statusText === "Accepted") {
        logger.info(`Email sent successfully`);
        res.send({ code: 0, data: "success" });
      } else {
        logger.error(`Email send failed with status: ${response?.status}`);
        res.send({ code: 1, data: "Email send failed" });
      }
    }
    
  } catch (error) {
    logger.error("Error in certificate processing:", error);
    console.log("error");
    console.log(error);
    
    if (error.response) {
      logger.error(`API error: ${error.response.status} - ${error.response.statusText}`);
      logger.error(`API error data:`, error.response.data);
    }
    
    // Send appropriate error response
    if (!res.headersSent) {
      res.status(500).send({
        code: 1,
        message: "Internal server error while processing certificate"
      });
    }
  }
});

function breakStringToArray(str, maxLen = 18) {
  const words = str.split(' ');
  const result = [];
  let line = '';

  for (let word of words) {
    if ((line + (line ? ' ' : '') + word).length <= maxLen) {
      line += (line ? ' ' : '') + word;
    } else {
      result.push(line);
      line = word;
    }
  }

  if (line) result.push(line);

  return result;
}

router.post("/send-microcertificate", isAuthenticated, async function (req, res, next) {
  const accessToken = await getToken();

  try {
    const pool = await getPool();
    const request = await pool.request();
    const Code = req.body.Code;
    const emailAddress = req.body.email;
    const NSN = req.body.NSN;
    const WorkshopResultID = Number(req.body.WorkshopResultID);
    const EnrollmentID = Number(req.body.EnrollmentID);

    if (!emailAddress) {
      return res.status(400).send({
        code: 1,
        message: "Please select",
      });
    }
    let query = "";
    if (Code) {
      request.input("Code", sql.VarChar, Code);
      query = `
      SELECT wsr.*,ws.CourseName,cs.CourseLevel,cs.CourseID FROM tblStudentInfo wsr
      LEFT OUTER JOIN tblWorkshop ws ON ws.Code = wsr.Code
      LEFT OUTER JOIN tblCourse cs ON cs.CourseID = ws.CourseID
      WHERE wsr.Code = @Code
      AND (wsr.IsDeleted IS NULL OR wsr.IsDeleted = 0)
      `;

      if (WorkshopResultID) {
        request.input("StudentID", sql.Int, WorkshopResultID);
        query += " AND wsr.StudentID = @WorkshopResultID;";
      }
    } else {
      request.input("EnrollmentID", sql.Int, EnrollmentID);
      query = `
      SELECT e.*, cs.CourseLevel, cs.CourseID FROM tblStudentInfo e
      LEFT OUTER JOIN tblCourse cs ON cs.CourseID = e.CourseID
      WHERE e.StudentID = @EnrollmentID
      `;
    }

    await request.query(query, async (err, result) => {
      if (err) console.log(err);
      if (!result?.recordset) {
        return res.send({
          code: 1,
          data: "No Data",
        });
      }
      const d = result.recordsets[0];
      const students = d
        .filter((item) => {
          if (!item.Result) return false;
          const d = JSON.parse(item.Result);
          if (!d?.Course || d?.Course === "Not Yet Achieved") {
            return false;
          }
          return true;
        })
        .map((e) => {
          return {
            NSN: e.NSN || "",
            lv: e.CourseLevel,
            learnerName: `${e.FirstName} ${e.LastName}`,
            date1: moment().format("MMMM YYYY"),
            date2: moment().format("DD MMMM YYYY"),
            course: e.CourseName,
          };
        });
      if (!students.length) {
        return res.send({ code: 1, data: "error" });
      }
      const attachments = await generateCertificateMicro(students);
      const subject1 = students.map((e) => e.learnerName).join(",");
      const subject2 = students[0].NSN;
      const mailOptions = {
        message: {
          subject: `Micro-Credential for ${subject1}`,
          body: {
            contentType: "Text",
            content: "Please see the attached Micro-Credential file.",
          },
          toRecipients: [
            {
              emailAddress: {
                address: emailAddress,
              },
            },
          ],
          attachments,
        },
      };

      const response = await axios.post(sendMailUrl, mailOptions, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });
      if (response?.statusText === "Accepted" || response?.status === 202) {
        res.send({ code: 0, data: "success" });
      } else {
        res.send({ code: 1, data: "error" });
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post("/send-micro", isAuthenticated, async function (req, res, next) {
  const accessToken = await getToken();

  try {
    const pool = await getPool();
    const request = await pool.request();
    const Code = req.body.Code;
    const emailAddress = req.body.email;
    const NSN = req.body.NSN;
    const WorkshopResultID = Number(req.body.WorkshopResultID);
    const EnrollmentID = Number(req.body.EnrollmentID);

    if (!emailAddress) {
      return res.status(400).send({
        code: 1,
        message: "Please select",
      });
    }
    let query = "";
    if (Code) {
      request.input("Code", sql.VarChar, Code);
      query = `
      SELECT wsr.*,ws.CourseName,cs.CourseLevel,cs.CourseID FROM tblStudentInfo wsr
      LEFT OUTER JOIN tblWorkshop ws ON ws.Code = wsr.Code
      LEFT OUTER JOIN tblCourse cs ON cs.CourseID = ws.CourseID
      WHERE wsr.Code = @Code
      AND (wsr.IsDeleted IS NULL OR wsr.IsDeleted = 0)
      `;

      if (WorkshopResultID) {
        request.input("StudentID", sql.Int, WorkshopResultID);
        query += "AND wsr.StudentID = @WorkshopResultID;";
      }
    } else {
      request.input("EnrollmentID", sql.Int, EnrollmentID);
      query = `
      SELECT e.*,cs.CourseLevel,cs.CourseID FROM tblStudentInfo e
      LEFT OUTER JOIN tblCourse cs ON cs.CourseID = e.CourseID
      WHERE e.StudentID = @EnrollmentID
      `;
    }

    await request.query(query, async (err, result) => {
      if (err) console.log(err);
      if (!result?.recordset) {
        return res.send({
          code: 1,
          data: "No Data",
        });
      }
      const d = result.recordsets[0];
      const students = d
        .filter((item) => {
          if (!item.Result) return false;
          const d = JSON.parse(item.Result);
          if (!d?.Course || d?.Course === "Not Yet Achieved") {
            return false;
          }
          return true;
        })
        .map((e) => {
          return {
            NSN: e.NSN || "",
            lv: e.CourseLevel,
            learnerName: `${e.FirstName} ${e.LastName}`,
            date1: moment().format("MMMM YYYY"),
            date2: moment().format("DD MMMM YYYY"),
            course: e.CourseName,
          };
        });
      if (!students.length) {
        return res.send({ code: 1, data: "error" });
      }
      const attachments = await generateCertificateMicro(students);
      const subject1 = students.map((e) => e.learnerName).join(",");
      const subject2 = students[0].NSN;
      const mailOptions = {
        message: {
          subject: `Micro-Credential for ${subject1}`,
          body: {
            contentType: "Text",
            content: "Please see the attached Micro-Credential file.",
          },
          toRecipients: [
            {
              emailAddress: {
                address: emailAddress,
              },
            },
          ],
          attachments,
        },
      };

      const response = await axios.post(sendMailUrl, mailOptions, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });
      if (response?.statusText === "Accepted" || response?.status === 202) {
        res.send({ code: 0, data: "success" });
      } else {
        res.send({ code: 1, data: "error" });
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post("/sendresult", isAuthenticated, async function (req, res, next) {
  var StudentID = Number(req.body.StudentID);
  var CourseID = Number(req.body.CourseID);

  const emailAddress = req.body.email;
  const workshopCode = req.body.code;
  if (!emailAddress) {
    return res.status(400).send({
      code: 1,
      message: `Invalid  ${emailAddress} `,
    });
  }

  if (StudentID > 0) {
    await sendRemotLearnerResult(StudentID, CourseID, emailAddress, res)
  }
  else {
    if (workshopCode) {
      await sendWorkShopResult(workshopCode, emailAddress, res);
    }
  }
});

async function sendWorkShopResult(code, emailAddress, res) {
  try {
    const accessToken = await getToken();
    const pool = await getPool();
    const request = await pool.request();

    let query = `
DECLARE @columns NVARCHAR(MAX), @sql NVARCHAR(MAX);

-- Step 1: Build the column list dynamically
SELECT @columns = STRING_AGG(QUOTENAME(US), ', ')
FROM (
    SELECT DISTINCT U.US
    FROM tblStudentInCourse C 
	  INNER JOIN tblStudentInCourseUnitStandard R ON R.SICId = C.id
    INNER JOIN tblUnitStandard U ON R.UnitStandardID = U.UnitStandardID
    WHERE C.Code = '${code}'
) AS UniqueUS;

-- Step 2: Build dynamic SQL with JOIN
SET @sql = '
SELECT * FROM tblWorkshop WHERE Code = ''${code}''

SELECT 
    S.FirstName, 
    S.LastName, 
    ' + @columns + '
FROM tblStudentInCourse C
INNER JOIN tblStudentInfo S ON C.StudentID = S.StudentID
INNER JOIN tblWorkshop W ON C.Code = W.Code
LEFT JOIN (
    SELECT StudentID, ' + @columns + '
    FROM (
        SELECT 
            R.StudentID, 
            CAST(U.US AS VARCHAR) AS US, 
            R.UnitStatus
        FROM tblStudentInCourseUnitStandard R
        INNER JOIN tblUnitStandard U ON R.UnitStandardID = U.UnitStandardID
        INNER JOIN tblStudentInCourse C ON R.StudentID = C.StudentID
        WHERE C.Code = ''${code}''
    ) AS Source
    PIVOT (
        MAX(UnitStatus) FOR US IN (' + @columns + ')
    ) AS Pivoted
) AS UnitPivot ON UnitPivot.StudentID = S.StudentID
WHERE C.Code = ''${code}'' AND ISNULL(S.IsDeleted, 0) = 0
ORDER BY S.StudentID;

    SELECT DISTINCT U.US, U.USVersion
    FROM tblStudentInCourseUnitStandard R
    INNER JOIN tblUnitStandard U ON R.UnitStandardID = U.UnitStandardID
    INNER JOIN tblStudentInCourse C ON R.StudentID = C.StudentID AND R.CourseID = C.CourseID
    WHERE C.Code = ''${code}''

';

-- Step 3: Execute dynamic SQL
EXEC sp_executesql @sql;
`;

    console.log("Send WorkShopResult query");
    console.log(query);

    await request.query(query, async (err, result) => {
      if (err) console.log(err);
      if (!result?.recordset) {
        return res.send({
          code: 1,
          data: "No Data",
        });
      }

      const d = result.recordsets[0];
      const workShops = d.map((e) => {
        return {
          schoolname: `${e.SchoolName} `,
          date: `${moment(e.CourseDate).format("DD MMMM YYYY")} `,
          workshopname: e.CourseName || "",
          code: e.Code || "",
        };
      });

      if (!workShops.length) {
        return res.send({ code: 1, data: "error" });
      }


      var items = result.recordsets[1].map((e) => {
        return {
          ...e
        };
      });

      var workShop = workShops[0];
      workShop.items = items;
      workShop.columns = result.recordsets[2];
      /*console.log("workShop");
      console.log(workShop.columns);
      console.log(workShop);*/
      const attachments = await generateWorkshopResult(workShop);
      const mailOptions = {
        message: {
          subject: `${workShop.code} - Workshop Result`,
          body: {
            contentType: "Text",
            content: "Please see the attached file.",
          },
          toRecipients: [
            {
              emailAddress: {
                address: emailAddress,
              },
            },
          ],
          attachments,
        },
      };

      const response = await axios.post(sendMailUrl, mailOptions, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      if (response?.statusText === "Accepted" || response?.status === 202) {
        res.send({ code: 0, data: "success" });
      } else {
        res.send({ code: 1, data: "error" });
      }/*
      res.send({ code: 1, data: "error" });/**/
    });
  } catch (error) {
    next(error);
  }
}

async function sendRemotLearnerResult(StudentID, CourseID, emailAddress, res) {
  try {
    const accessToken = await getToken();
    const pool = await getPool();
    const request = await pool.request();

    let query = `
    SELECT FirstName, LastName, W.SchoolName, (SELECT CourseName FROM tblCourse where CourseID = @CourseID) AS CourseName
    FROM tblStudentInfo S
    LEFT JOIN tblSchoolWorkplace W ON S.SchoolNumber = W.SchoolNumber
    WHERE StudentID = @StudentID;
    
    SELECT US.US, ISNULL(UR.UnitStatus, '') UnitStatus, US.USVersion from tblStudentInCourseUnitStandard UR
    INNER JOIN tblUnitStandard US ON UR.UnitStandardID = US.UnitStandardID
    where StudentID = @StudentID AND (@CourseID = 0 OR CourseID = @CourseID);
    `;

    request.input("StudentID", sql.Int, StudentID);
    request.input("CourseID", sql.Int, CourseID||0);
    

    await request.query(query, async (err, result) => {
      if (err) console.log(err);
      if (!result?.recordset) {
        return res.send({
          code: 1,
          data: "No Data",
        });
      }

      const d = result.recordsets[0];
      const students = d.map((e) => {
        return {
          learnername: `${e.FirstName} ${e.LastName}`,
          date: moment().format("DD MMMM YYYY"),
          schoolname: e.SchoolName,
          coursename: e.CourseName
        };
      });


      if (!students.length) {
        return res.send({ code: 1, data: "error" });
      }

      var items = result.recordsets[1].map((e) => {
        return {
          US: e.US,
          status: e.UnitStatus,
          Version: e.USVersion,
        };
      });

      var student = students[0];
      student.items = items;



      console.log("student");
      console.log(student);
      console.log(" result.recordsets[1]");
      console.log( result.recordsets[1]);
      console.log("Query");
      console.log(query);
      console.log("StudentID");
      console.log(StudentID);

      const attachments = await generateRemotLearneResult(student);
      const mailOptions = {
        message: {
          subject: `Student Result - ${student.learnername}`,
          body: {
            contentType: "Text",
            content: "Please see the attached file.",
          },
          toRecipients: [
            {
              emailAddress: {
                address: emailAddress,
              },
            },
          ],
          attachments,
        },
      };

      const response = await axios.post(sendMailUrl, mailOptions, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });
      if (response?.statusText === "Accepted" || response?.status === 202) {
        res.send({ code: 0, data: "success" });
      } else {
        res.send({ code: 1, data: "error" });
      }
    });
  } catch (error) {
    next(error);
  }
}
module.exports = router;
