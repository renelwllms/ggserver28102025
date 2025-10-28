

const axios = require("axios");
const sql = require("mssql");
const logger = require("../../log/logger");
const fs = require("fs");
const path = require("path");

const { getPagination, getPool } = require("../utils");

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

async function getEmailConfig(code) {
    const pool = await getPool();
    const request = await pool.request();
    const query = `
    SELECT * FROM [dbo].[tblEmailConfiguration] WHERE Code = @Code
  `;

    request.input("Code", sql.VarChar(sql.MAX), code || "");
    try {
        const result = await request.query(query);
        return result.recordset[0];
    }
    catch (err) {
        console.error("Error fetching email config:", err);
        return null;
    }
}


// Prepare a function to replace the variables and generate new documents
async function GetEmailTemplate(dataList) {
    logger.info("Start handles");
    const templatePath = path.join(__dirname, "emailtemplate.html");
    logger.info(`templatePath path : ${templatePath}`);
    const templatePageContent = await fs.promises.readFile(templatePath, "utf8");
    logger.info(`Read file from above path`);
    /*
    const templateContentPath = path.join(__dirname, contentTemplate);
    logger.info("Template Content path");
    logger.info(templateContentPath);
    const templateContent = await fs.promises.readFile(templateContentPath, "utf8");
    logger.info("Read template content");
  */
    let htmlContent = templatePageContent;
    logger.info("htmlContent varible create");

    let newDivs = "";
    let i = 0;
    logger.info("strat key extractonr and page generate");
    dataList.forEach(data => {
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
    });

    logger.info("End html generate");
    return htmlContent;
}


async function GetBlankEmailTemplate() {
    logger.info("Start handles");
    const templatePath = path.join(__dirname, "emailtemplate.html");
    logger.info(`templatePath path : ${templatePath}`);
    const templatePageContent = await fs.promises.readFile(templatePath, "utf8");
    logger.info(`Read file from above path`);
    /*
    const templateContentPath = path.join(__dirname, contentTemplate);
    logger.info("Template Content path");
    logger.info(templateContentPath);
    const templateContent = await fs.promises.readFile(templateContentPath, "utf8");
    logger.info("Read template content");
  */
    let htmlContent = templatePageContent;

    logger.info("End html generate");
    return htmlContent;
}


async function email(code, subject, workShopCode, CourseStatus) {
    try {
        console.log("01");
        const accessToken = await getToken();
        console.log("02");
        const emailConfig = await getEmailConfig(code);
        console.log("03");
        if (emailConfig == null) {
            return;
        }
        console.log("04");
        let emailBody = emailConfig.emailBody;

        console.log("05");
        const now = new Date();
        const formattedDate = now.toISOString().split('T')[0];
        const replacements = {
            "{CODE}": workShopCode,
            "{STATUS}": CourseStatus,
            "{COMPLETIONDATE}": formattedDate
        };

        for (const key in replacements) {
            emailBody = emailBody.replace(new RegExp(key, "g"), replacements[key]);
        }

        var data = {
            LEARNERNAME: "",
            EMAILBODY: emailBody,
        };

        const mailOptions = {
            message: {
                subject: `${subject}`,
                body: {
                    contentType: "TEXT",
                    content: emailBody,
                },
                toRecipients: [
                    {
                        emailAddress: {
                            address: emailConfig.emailAddress,
                        },
                    },
                ],
            },
        };

        const response = await axios.post(sendMailUrl, mailOptions, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
        });
        if (response?.statusText === "Accepted" || response?.status === 202) {
        } else {
            console.log("End email error");
        }
    }
    catch (error) {
        console.error("Error sending email:");
    }
}

async function SendTemplateEmail(code, subject, data, overrideEmail = null) {
    try {
        console.log("01");
        const accessToken = await getToken();
        console.log("02");
        const emailConfig = await getEmailConfig(code);
        console.log("03");
        if (emailConfig == null) {
            return;
        }
        console.log("04");
        let emailBody = emailConfig.emailBody;

        console.log("05");
        for (const key in data) {
            console.log(`06 ${key}`);
            try{
                const pattern = new RegExp(`{${key.toUpperCase()}}`, "g");
                emailBody = emailBody.replace(pattern, data[key]);
            }
            catch(ex){
                console.log(`Cannot find attribute ${key}`);
            }
        }

        console.log("07");
        console.log("08");
        var htmlContent = emailBody;

        // Use override email if provided, otherwise use config email
        const recipientEmail = overrideEmail || emailConfig.emailAddress;
        console.log(`Sending email to: ${recipientEmail}`);
        console.log(htmlContent);
        const mailOptions = {
            message: {
                subject: `${subject}`,
                body: {
                    contentType: "text",
                    content: htmlContent,
                },
                toRecipients: [
                    {
                        emailAddress: {
                            address: recipientEmail,
                        },
                    },
                ],
            },
        };

        const response = await axios.post(sendMailUrl, mailOptions, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
        });
        console.log("Email sending response");
        console.log(response);
        console.log(response?.statusText);
        if (response?.statusText === "Accepted" || response?.status === 202) {
        } else {
            console.log("End email error");
        }
    }
    catch (error) {
        console.error("Error sending email:");
    }
}

module.exports = { email, SendTemplateEmail };
