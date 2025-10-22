const axios = require("axios");
const GRAPH_ME_ENDPOINT = "https://graph.microsoft.com/v1.0/me";
const adminName = ["Admin"];
const obj = {};

const allowedEmailDomain = "thegetgroup.co.nz";

function deleteKeyAfterDelay(key) {
  setTimeout(() => {
    delete obj[key];
  }, 1000 * 60 * 60);
}

async function isAuthenticated(req, res, next) {
  const authorization = req?.headers?.authorization || "";
  const id = authorization.slice(-16);
  const nowTime = new Date().getTime();

  if (obj[id] && nowTime - obj[id]?.t < 1000 * 60 * 60) {
    // console.log(obj);
    //console.log(nowTime - obj[id]?.t);
    Object.assign(req, obj[id]);
    next();
  } else {
    delete obj[id];
    try {
      // Check if authorization already has "Bearer" prefix
      const authHeader = authorization.startsWith('Bearer ')
        ? authorization
        : `Bearer ${authorization}`;

      const options = {
        headers: {
          Authorization: authHeader,
        },
      };
      const response = await axios.get(GRAPH_ME_ENDPOINT, options);
      if (response?.data) {
        const user = response.data;

        // 🔒 Domain Check
        const userEmail = user?.userPrincipalName || user?.mail;
        if (!userEmail.endsWith(`@${allowedEmailDomain}`)) {
          return res.status(403).send("Unauthorized domain.");
        }

        req.info = response.data;
        req.admin = adminName.includes(response.data?.givenName);
        req.authorization = authorization;
        obj[id] = {
          info: req.info,
          admin: req.admin,
          authorization: req.authorization,
          t: nowTime,
        };
        deleteKeyAfterDelay(id);
      }
      next();
    } catch (error) {
      next(error);
    }
  }
}

module.exports = isAuthenticated;
