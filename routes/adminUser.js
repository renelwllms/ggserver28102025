const express = require("express");
const router = express.Router();
const isAuthenticated = require("./auth");
const { getPagination, getPool } = require("./utils");
const sql = require("mssql");
const { nanoid } = require("nanoid");


router.get("/Activelist", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();

    let query = `SELECT * FROM   tblAdminUser WHERE (IsActive = 1)`;

    const name = req.query.name;

    if (name) {
      request.input("name", sql.VarChar, `${name}%`);
      query += ` AND name Like @name`;
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

router.get("/Alllist", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();

    let query = `SELECT * FROM   tblAdminUser WHERE (1 = 1)`;

    const name = req.query.name;

    if (name) {
      request.input("name", sql.VarChar, `${name}%`);
      query += ` AND name Like @name`;
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


router.get("/ByEmail", async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();
    const email = req.query.email;

    if (!email) {
      return res.send({ code: 400, message: "Missing Email" });
    }

    let query = `SELECT * FROM   tblAdminUser WHERE (1 = 1)  AND Email = @email`;
    request.input("email", sql.VarChar, `${email}`);
    request.query(query, (err, result) => {
      if (err) console.log(err);
      if (result?.recordset) {
        const d = result.recordsets[0][0] || [];
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

router.post("/Add", isAuthenticated, async (req, res, next) => {
  const {
    Name,
    Email, 
    UserRole,
    IsActive, 
  } = req.body;
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const request = new sql.Request(transaction);
    let query = ` 
    INSERT INTO [dbo].[tblAdminUser]
           (Name, Email, UserRole, IsActive)
     VALUES
           (@Name, @Email, @UserRole, @IsActive)
    `;
    request.input("Name", sql.VarChar, Name);
    request.input("Email", sql.VarChar, Email);
    request.input("UserRole", sql.VarChar, UserRole);
    request.input("IsActive", sql.Bit, IsActive);

    await request.query(query);
    await transaction.commit();
    res.send({ code: 0, data: true, message: "Admin User created successfully" });

  } catch (error) {
    await transaction.rollback();
    next(error);
  }
});


router.put("/Update", isAuthenticated, async (req, res, next) => {
  const {
    Id,
    Name,
    Email, 
    UserRole,
    IsActive, 
  } = req.body;
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const request = new sql.Request(transaction);
    let query = ` 
      UPDATE tblAdminUser
      SET Name = @Name, Email = @Email, UserRole = @UserRole, IsActive = @IsActive
      WHERE Id = @Id;
    `;
    request.input("Id", sql.Int, Id);
    request.input("Name", sql.VarChar, Name);
    request.input("Email", sql.VarChar, Email);
    request.input("UserRole", sql.VarChar, UserRole);
    request.input("IsActive", sql.Bit, IsActive);
    await request.query(query);
    await transaction.commit();
    res.send({ code: 0, data: "true", message: "Admin User updated successfully" });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
});


router.post("/delete", isAuthenticated, async (req, res, next) => {
  const {id,} = req.body;
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    const request = new sql.Request(transaction);
    let query = ` 
    DELETE FROM [dbo].[tblAdminUser] WHERE id = @id
    `;
    request.input("id", sql.Int, id);

    await request.query(query);
    await transaction.commit();
    res.send({ code: 0, data: true, message: "User delete successfully" });

  } catch (error) {
    await transaction.rollback();
    next(error);
  }
});

module.exports = router;
