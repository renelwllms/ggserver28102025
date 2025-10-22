const express = require("express");
const router = express.Router();
const isAuthenticated = require("./auth");
const { getPool } = require("./utils");
const sql = require("mssql");

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

    if (Name) {
      request.input("Name", sql.VarChar, `${Name}%`);
      query += ` AND Name Like @Name`;
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


router.post("/CommTypeAdd", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();
    const id = Number(req.body.id);
    const {
      Name,
      Subject,
      Template,
    } = req.body;
    

    if (!Name || !Template) {
      return res.send({ code: 1, message: "Invalide data" });
    }
    request.input("Name", sql.VarChar, Name);
    request.input("Subject", sql.VarChar, Subject);
    request.input("Template", sql.VarChar, Template);

    const query = `
    INSERT INTO tblCommunicationTemplates (Name, subject, Template)
    VALUES   (@Name, @Subject, @Template)
    `;

    request.query(query, (err) => {
      if (err) console.log(err);
      return res.send({
        code: 0,
        data: "save successfull",
      });
    });
  } catch (error) {
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
    } = req.body;
    

    if (!id) {
      return res.send({ code: 1, message: "Invalide data" });
    }
    request.input("id", sql.Int, id);
    request.input("Subject", sql.VarChar, Subject);
    request.input("Name", sql.VarChar, Name);
    request.input("Template", sql.VarChar, Template);

    const query = `
    Update tblCommunicationTemplates 
    SET Name = @Name,
    Template = @Template,
    Subject = @Subject
    WHERE (id = @id);
    
    `;

    request.query(query, (err) => {
      if (err) console.log(err);
      return res.send({
        code: 0,
        data: "save successfull",
      });
    });
  } catch (error) {
    next(error);
  }
});


router.post("/CommTypeDelete", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();
    const {id} = req.body;

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




module.exports = router;
