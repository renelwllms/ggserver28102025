const express = require("express");
const router = express.Router();
const isAuthenticated = require("./auth");
const { getPool } = require("./utils");
const sql = require("mssql");

// Get all microcredential groups with their courses
router.get("/groups", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();

    const query = `
      SELECT DISTINCT
        GroupId,
        MAX(GroupName) as GroupName,
        MAX(NotificationEmail) as NotificationEmail
      FROM tblMicroCredentialEligibility
      WHERE IsActive = 1
      GROUP BY GroupId
      ORDER BY GroupId
    `;

    const result = await request.query(query);

    // For each group, get the courses
    const groups = [];
    for (const group of result.recordset) {
      const coursesRequest = await pool.request();
      coursesRequest.input("GroupId", sql.Int, group.GroupId);

      const coursesQuery = `
        SELECT
          MCE.id,
          MCE.CourseID,
          MCE.GroupId,
          C.CourseName,
          C.CourseLevel
        FROM tblMicroCredentialEligibility MCE
        INNER JOIN tblCourse C ON MCE.CourseID = C.CourseID
        WHERE MCE.GroupId = @GroupId AND MCE.IsActive = 1
        ORDER BY C.CourseName
      `;

      const coursesResult = await coursesRequest.query(coursesQuery);

      groups.push({
        GroupId: group.GroupId,
        GroupName: group.GroupName || `Microcredential Group ${group.GroupId}`,
        NotificationEmail: group.NotificationEmail || 'jorgia@thegetgroup.co.nz',
        Courses: coursesResult.recordset
      });
    }

    return res.send({
      code: 0,
      data: groups
    });
  } catch (error) {
    console.error("Error fetching microcredential groups:", error);
    next(error);
  }
});

// Get single group with detailed information
router.get("/groups/:groupId", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();
    const groupId = parseInt(req.params.groupId);

    request.input("GroupId", sql.Int, groupId);

    const query = `
      SELECT
        MCE.id,
        MCE.CourseID,
        MCE.GroupId,
        C.CourseName,
        C.CourseLevel
      FROM tblMicroCredentialEligibility MCE
      INNER JOIN tblCourse C ON MCE.CourseID = C.CourseID
      WHERE MCE.GroupId = @GroupId AND MCE.IsActive = 1
      ORDER BY C.CourseName
    `;

    const result = await request.query(query);

    return res.send({
      code: 0,
      data: {
        GroupId: groupId,
        GroupName: `Microcredential Group ${groupId}`,
        Courses: result.recordset
      }
    });
  } catch (error) {
    console.error("Error fetching group:", error);
    next(error);
  }
});

// Get available courses (not in any group or all courses)
router.get("/available-courses", isAuthenticated, async function (req, res, next) {
  try {
    const pool = await getPool();
    const request = await pool.request();

    const query = `
      SELECT
        CourseID,
        CourseName,
        CourseLevel,
        CASE
          WHEN EXISTS (
            SELECT 1 FROM tblMicroCredentialEligibility
            WHERE CourseID = C.CourseID AND IsActive = 1
          ) THEN 1
          ELSE 0
        END as IsInGroup
      FROM tblCourse C
      WHERE C.IsDeleted IS NULL OR C.IsDeleted = 0
      ORDER BY CourseName
    `;

    const result = await request.query(query);

    return res.send({
      code: 0,
      data: result.recordset
    });
  } catch (error) {
    console.error("Error fetching courses:", error);
    next(error);
  }
});

// Create new group or add courses to existing group
router.post("/groups", isAuthenticated, async function (req, res, next) {
  try {
    if (!req?.admin) {
      return res.send({ code: 403, message: "Admin permission required" });
    }

    const { GroupId, CourseIds, GroupName, NotificationEmail } = req.body;

    if (!CourseIds || !Array.isArray(CourseIds) || CourseIds.length === 0) {
      return res.send({ code: 400, message: "Please select at least one course" });
    }

    const pool = await getPool();

    let newGroupId = GroupId;

    // If no GroupId provided, find the next available group ID
    if (!newGroupId) {
      const request = await pool.request();
      const result = await request.query(`
        SELECT ISNULL(MAX(GroupId), 0) + 1 as NextGroupId
        FROM tblMicroCredentialEligibility
      `);
      newGroupId = result.recordset[0].NextGroupId;
    }

    const groupName = GroupName || `Microcredential Group ${newGroupId}`;
    const notificationEmail = NotificationEmail || 'jorgia@thegetgroup.co.nz';

    // Insert courses into the group
    for (const courseId of CourseIds) {
      const request = await pool.request();
      request.input("GroupId", sql.Int, newGroupId);
      request.input("CourseId", sql.Int, courseId);

      // Check if this course is already in this group
      const checkQuery = `
        SELECT COUNT(*) as Count
        FROM tblMicroCredentialEligibility
        WHERE GroupId = @GroupId AND CourseId = @CourseId
      `;
      const checkResult = await request.query(checkQuery);

      if (checkResult.recordset[0].Count === 0) {
        const insertRequest = await pool.request();
        insertRequest.input("GroupId", sql.Int, newGroupId);
        insertRequest.input("CourseId", sql.Int, courseId);
        insertRequest.input("GroupName", sql.NVarChar, groupName);
        insertRequest.input("NotificationEmail", sql.NVarChar, notificationEmail);

        const insertQuery = `
          INSERT INTO tblMicroCredentialEligibility (GroupId, CourseId, IsActive, GroupName, NotificationEmail)
          VALUES (@GroupId, @CourseId, 1, @GroupName, @NotificationEmail)
        `;
        await insertRequest.query(insertQuery);
      }
    }

    return res.send({
      code: 0,
      data: { GroupId: newGroupId },
      message: "Microcredential group created successfully"
    });
  } catch (error) {
    console.error("Error creating group:", error);
    next(error);
  }
});

// Update group (add/remove courses)
router.put("/groups/:groupId", isAuthenticated, async function (req, res, next) {
  try {
    if (!req?.admin) {
      return res.send({ code: 403, message: "Admin permission required" });
    }

    const groupId = parseInt(req.params.groupId);
    const { CourseIds, GroupName, NotificationEmail } = req.body;

    if (!CourseIds || !Array.isArray(CourseIds)) {
      return res.send({ code: 400, message: "Invalid course list" });
    }

    const pool = await getPool();

    // Update GroupName and NotificationEmail for all records in this group
    if (GroupName || NotificationEmail) {
      const updateRequest = await pool.request();
      updateRequest.input("GroupId", sql.Int, groupId);

      let updateQuery = 'UPDATE tblMicroCredentialEligibility SET ';
      const updates = [];

      if (GroupName) {
        updateRequest.input("GroupName", sql.NVarChar, GroupName);
        updates.push('GroupName = @GroupName');
      }

      if (NotificationEmail) {
        updateRequest.input("NotificationEmail", sql.NVarChar, NotificationEmail);
        updates.push('NotificationEmail = @NotificationEmail');
      }

      updateQuery += updates.join(', ') + ' WHERE GroupId = @GroupId';
      await updateRequest.query(updateQuery);
    }

    // Remove courses not in the new list
    const deleteRequest = await pool.request();
    deleteRequest.input("GroupId", sql.Int, groupId);

    let deleteQuery = `
      DELETE FROM tblMicroCredentialEligibility
      WHERE GroupId = @GroupId
    `;

    if (CourseIds.length > 0) {
      deleteQuery += ` AND CourseId NOT IN (${CourseIds.join(',')})`;
    }

    await deleteRequest.query(deleteQuery);

    // Get current group info for defaults
    const groupInfoRequest = await pool.request();
    groupInfoRequest.input("GroupId", sql.Int, groupId);
    const groupInfoResult = await groupInfoRequest.query(`
      SELECT TOP 1 GroupName, NotificationEmail
      FROM tblMicroCredentialEligibility
      WHERE GroupId = @GroupId
    `);

    const groupName = groupInfoResult.recordset[0]?.GroupName || GroupName || `Microcredential Group ${groupId}`;
    const notificationEmail = groupInfoResult.recordset[0]?.NotificationEmail || NotificationEmail || 'jorgia@thegetgroup.co.nz';

    // Add new courses
    for (const courseId of CourseIds) {
      const checkRequest = await pool.request();
      checkRequest.input("GroupId", sql.Int, groupId);
      checkRequest.input("CourseId", sql.Int, courseId);

      const checkQuery = `
        SELECT COUNT(*) as Count
        FROM tblMicroCredentialEligibility
        WHERE GroupId = @GroupId AND CourseId = @CourseId
      `;
      const checkResult = await checkRequest.query(checkQuery);

      if (checkResult.recordset[0].Count === 0) {
        const insertRequest = await pool.request();
        insertRequest.input("GroupId", sql.Int, groupId);
        insertRequest.input("CourseId", sql.Int, courseId);
        insertRequest.input("GroupName", sql.NVarChar, groupName);
        insertRequest.input("NotificationEmail", sql.NVarChar, notificationEmail);

        const insertQuery = `
          INSERT INTO tblMicroCredentialEligibility (GroupId, CourseId, IsActive, GroupName, NotificationEmail)
          VALUES (@GroupId, @CourseId, 1, @GroupName, @NotificationEmail)
        `;
        await insertRequest.query(insertQuery);
      }
    }

    return res.send({
      code: 0,
      message: "Microcredential group updated successfully"
    });
  } catch (error) {
    console.error("Error updating group:", error);
    next(error);
  }
});

// Delete entire group
router.delete("/groups/:groupId", isAuthenticated, async function (req, res, next) {
  try {
    if (!req?.admin) {
      return res.send({ code: 403, message: "Admin permission required" });
    }

    const groupId = parseInt(req.params.groupId);

    const pool = await getPool();
    const request = await pool.request();
    request.input("GroupId", sql.Int, groupId);

    const query = `
      DELETE FROM tblMicroCredentialEligibility
      WHERE GroupId = @GroupId
    `;

    await request.query(query);

    return res.send({
      code: 0,
      message: "Microcredential group deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting group:", error);
    next(error);
  }
});

// Remove single course from group
router.delete("/groups/:groupId/courses/:courseId", isAuthenticated, async function (req, res, next) {
  try {
    if (!req?.admin) {
      return res.send({ code: 403, message: "Admin permission required" });
    }

    const groupId = parseInt(req.params.groupId);
    const courseId = parseInt(req.params.courseId);

    const pool = await getPool();
    const request = await pool.request();
    request.input("GroupId", sql.Int, groupId);
    request.input("CourseId", sql.Int, courseId);

    const query = `
      DELETE FROM tblMicroCredentialEligibility
      WHERE GroupId = @GroupId AND CourseId = @CourseId
    `;

    await request.query(query);

    return res.send({
      code: 0,
      message: "Course removed from group successfully"
    });
  } catch (error) {
    console.error("Error removing course:", error);
    next(error);
  }
});

module.exports = router;
