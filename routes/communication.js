const express = require("express");
const router = express.Router();
const isAuthenticated = require("./auth");
const { getPool } = require("./utils");
const sql = require("mssql");
const axios = require("axios");
const { stringify } = require("qs");

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

router.get("/list", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();

    let query = `
    SELECT  C.*, T.Name SubTypeName
    FROM tblCommunications C
    LEFT JOIN tblCommunicationTemplates T ON C.SubType = T.id
    `;

    const StudentId = req.query.StdentId;
    if (StudentId) {
      request.input("StudentId", sql.Int, StudentId);
      query += ` AND StudentId = @StudentId`;
    }    
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

async function sendEmail(emailAddress, subject, message) {
  const accessToken = await getToken();
  const mailOptions = {
    message: {
      subject: `${subject}`,
      body: {
        contentType: "Text",
        content: message,
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
}

router.post("/Add", isAuthenticated, async function (req, res, next) {
    try {
      const pool = await getPool();
      const request = await pool.request();
      const {StudentId, CommunicationType, SubType, CommDate, CommTime, Message} = req.body;

      if (!StudentId) {
        return res.send({ code: 1, message: "Code Error" });
      }
      
      if (!CommunicationType) {
        return res.send({ code: 1, message: "Communication Type Error" });
      }

      request.input("StudentId", sql.Int, StudentId);
      request.input("CommunicationType", sql.VarChar, CommunicationType);
      request.input("SubType", sql.Int, SubType);
      request.input("CommDate", sql.VarChar, CommDate);
      request.input("CommTime", sql.VarChar, CommTime);
      request.input("Message", sql.VarChar, Message);
      const query = `
        DECLARE @CreateDate DATETIME = GETDATE();
        INSERT INTO tblCommunications(StudentId, CommunicationType, CommDate, CommTime, Message, SubType)
        VALUES(@StudentId, @CommunicationType, @CommDate, @CommTime, @Message, @SubType);
    `;

      request.query(query, (err) => {
        if (err) console.log(err);
        sendEmail();
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



router.post("/Update", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();
    const {id, StudentId, CommunicationType, SubType, CommDate, CommTime, Message} = req.body;

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


router.post("/delete", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();
    const {id, StudentId, CommunicationType, SubType, CommDate, CommTime, Message} = req.body;

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

module.exports = router;
