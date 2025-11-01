const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");
const logger = require("../log/logger");
const os = require("os");
// Load the Word template

// Helper function to get Puppeteer launch options
function getPuppeteerOptions() {
  const tmpDir = path.join(os.tmpdir(), 'puppeteer-chrome-' + Date.now());
  return {
    headless: true,
    executablePath: "/home/epladmin/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--disable-gpu-sandbox",
      "--no-zygote",
      "--disable-seccomp-filter-sandbox",
      "--disable-namespace-sandbox",
      "--disable-features=VizDisplayCompositor,NetworkService",
      "--disable-background-networking",
      "--disable-breakpad",
      "--disable-component-extensions-with-background-pages",
      "--js-flags=--max-old-space-size=512",
      `--user-data-dir=${tmpDir}`
    ],
    ignoreDefaultArgs: ['--disable-extensions']
  };
}

function replaceItems(html, items) {
  let itemHtml = "";

  items.forEach((item) => {
    itemHtml += `
      <tr>
        <td class="unit-standard">${item.US}</td>
        <td class="description">${item.Description}</td>
        <td class="credit-value">${item.Value}</td>
        <td class="level">${item.Level}</td>
      </tr>
    `;
  });

  return html.replace("{#items}", itemHtml);
}

// Prepare a function to replace the variables and generate new documents
async function handle(data, p, option) {
  logger.info("Start handle");
  const templatePath = path.join(__dirname, p);
  logger.info(`Joind templath path ${templatePath}`);
  const templateContent = await fs.promises.readFile(templatePath, "utf8");

  logger.info(`Read file from path`);
  const keys = Object.keys(data).filter((e) => e !== "items");
  const values = Object.values(data).filter((e) => e !== "items");

  logger.info(`Extract data from object as key and values`);
  const replacements = {};
  keys.forEach((key, index) => {
    replacements[`{${key}}`] = values[index];
  });

  logger.info(`Replace object created`);
  let updatedData = templateContent.replace(
    new RegExp(keys.map((key) => `{${key}}`).join("|"), "g"),
    (matched) => replacements[matched]
  );
  
  logger.info(`Start data replace`);
  if (data?.items) {
    updatedData = replaceItems(updatedData, data?.items);
  }
  logger.info(`End replace item`);

  const puppeteerOptions = getPuppeteerOptions();
  logger.info(`Puppeteer options: ${JSON.stringify(puppeteerOptions, null, 2)}`);

  let browser;
  try {
    browser = await puppeteer.launch(puppeteerOptions);
    logger.info(`Browser launched successfully`);
  } catch (error) {
    logger.error(`Failed to launch browser: ${error.message}`);
    logger.error(`Error stack: ${error.stack}`);
    logger.error(`Full error object: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`);
    throw error;
  }

  logger.info(`Launch browser`);
  const page = await browser.newPage();
  
  logger.info(`New page created`);
  await page.setContent(updatedData);

  logger.info(`Set content`);

  // Optimize PDF generation with compression settings
  const optimizedOptions = {
    ...option,
    scale: 0.8,  // Reduce scale to 80% for smaller file size
    preferCSSPageSize: true,
    displayHeaderFooter: false,
    margin: {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    }
  };

  const pdfBuffer = await page.pdf(optimizedOptions);

  logger.info(`PDF buffer generated - Size: ${pdfBuffer.length} bytes`);
  const buffer = Buffer.from(pdfBuffer);

  logger.info(`Create buffer from data array`);
  await browser.close();

  logger.info(`Close browser and return base 64`);
  return buffer.toString('base64')
}


async function asyncMap(array, asyncCallback) {
  const promises = array.map(async (item, index) => {
    return await asyncCallback(item, index, array);
  });
  return Promise.all(promises);
}

async function generateCertificate(data) {
  logger.info(`Start generate certificate`);
  if (!Array.isArray(data)) return [];
  logger.info(`Check is array or not`);

  const results = await asyncMap(data, async (d) => {
    logger.info(`Build requiest by colling asyncMap`);
    return {
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: `Certificate_${d.learnerName}.pdf`,
      contentType: "application/pdf",
      contentBytes: await handle(
        {
          LEARNER: d.learnerName,
          DATE: d.date,
          COURSE: d.course,
          items: d.items,
        },
        "AchievementCertificate.html",
        {
          width: "297mm",
          height: "210mm",
          border: "0",
          pageRanges: "1",
          printBackground: true,
        }
      ),
    };
  });
  return results;
}

// Prepare a function to replace the variables and generate new documents
async function handles(dataList, p, contentTemplate, option) {
  logger.info("Start handles");
  const templatePath = path.join(__dirname, p);
  logger.info(`templatePath path : ${templatePath}`);
  const templatePageContent = await fs.promises.readFile(templatePath, "utf8");
  logger.info(`Read file from above path`);
  const templateContentPath = path.join(__dirname, contentTemplate);
  logger.info("Template Content path");
  logger.info(templateContentPath);
  const templateContent = await fs.promises.readFile(templateContentPath, "utf8");
  logger.info("Read template content");

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
      const replacement =  values[index];
      var repValue = typeof replacement === "string" ? replacement.replace(",", "") : replacement;
      replacements[`{${key}}`] = repValue;
    });
    let updatedData = templateContent.replace(
      new RegExp(keys.map((key) => `{${key.toUpperCase()}}`).join("|"), "g"),
      (matched) => replacements[matched.toLowerCase()]
    );
    if (data?.items) {
      updatedData = replaceItems(updatedData, data?.items);
    }

    newDivs += updatedData;
  });
  logger.info("end page generate dataList");

  // Insert the new divs into page-container
  htmlContent = htmlContent.replace('{bodyContent}', `${newDivs}`);

  logger.info("End html generate");
  const puppeteerOptions = getPuppeteerOptions();
  logger.info(`Puppeteer options (handles): ${JSON.stringify(puppeteerOptions, null, 2)}`);

  let browser;
  try {
    browser = await puppeteer.launch(puppeteerOptions);
    logger.info(`Browser launched successfully (handles)`);
  } catch (error) {
    logger.error(`Failed to launch browser (handles): ${error.message}`);
    logger.error(`Error stack: ${error.stack}`);
    logger.error(`Full error object: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`);
    throw error;
  }

  logger.info(`open browser`);
  const page = await browser.newPage();
  await page.setContent(htmlContent);

  logger.info("Set content");

  // Optimize PDF generation with compression settings
  const optimizedOptions = {
    ...option,
    scale: 0.8,  // Reduce scale to 80% for smaller file size
    preferCSSPageSize: true,
    displayHeaderFooter: false,
    margin: {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    }
  };

  const pdfBuffer = await page.pdf(optimizedOptions);
  // Generate PDF filename with timestamp
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5); // Remove milliseconds
  const pdfFileName = `${timestamp}.pdf`;

  // Save PDF to the same directory as the script
  const pdfPath = path.join(__dirname, pdfFileName);
  await fs.promises.writeFile(pdfPath, pdfBuffer);
  logger.info(`PDF saved to: ${pdfPath}`);
  logger.info(`PDF size: ${(pdfBuffer.length / 1024).toFixed(2)} KB`);

  logger.info("create pdf buffer");
  const buffer = Buffer.from(pdfBuffer);
  await browser.close();
  logger.info("Close browser and return file");
  return buffer.toString('base64')
}

async function generateAllCertificates(reportName, attachmentName, dataList) {
  if (!Array.isArray(dataList)) return [];
  var data = [""]
  const results = await asyncMap(data, async (d) => {
    return {
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: `${attachmentName}_Certificate.pdf`,
      contentType: "application/pdf",
      contentBytes: await handles(dataList, `${reportName}.html`, `${reportName}Content.html`,
        {
          width: "297mm",
          height: "210mm",
          border: "0",
          pageRanges: `1-${dataList.length}`,
          printBackground: true,
        }
      ),
    };
  });
  return results;
}

async function generateAllPdfCertificates(reportName, attachmentName, dataList, type) {
  if (!Array.isArray(dataList)) return [];
  const results = await getPdfByts(dataList, `${reportName}.html`, `${reportName}Content.html`,
        {
          width: "297mm",
          height: "210mm",
          printBackground: true,
        }, type);
  return results;
}

async function deleteYesterdayFiles() {
  const dir = __dirname; // directory where PDFs are stored
  const files = await fs.promises.readdir(dir);

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  for (const file of files) {
    if (file.endsWith(".pdf")) {
      const filePath = path.join(dir, file);
      const stats = await fs.promises.stat(filePath);

      const fileDate = stats.mtime; // last modified time
      if (
        fileDate.getFullYear() === yesterday.getFullYear() &&
        fileDate.getMonth() === yesterday.getMonth() &&
        fileDate.getDate() === yesterday.getDate()
      ) {
        await fs.promises.unlink(filePath);
        console.log(`Deleted yesterday's file: ${filePath}`);
      }
    }
  }
}

// Prepare a function to replace the variables and generate new documents
async function getPdfByts(dataList, p, contentTemplate, option, type) {
  logger.info("Delete yesterday’s file(s) before writing a new one");
  await deleteYesterdayFiles();
  logger.info("Start handles");
  const templatePath = path.join(__dirname, p);
  logger.info(`templatePath path : ${templatePath}`);
  const templatePageContent = await fs.promises.readFile(templatePath, "utf8");
  logger.info(`Read file from above path`);
  const templateContentPath = path.join(__dirname, contentTemplate);
  logger.info("Template Content path");
  logger.info(templateContentPath);
  const templateContent = await fs.promises.readFile(templateContentPath, "utf8");
  logger.info("Read template content");

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
      const replacement =  values[index];
      var repValue = typeof replacement === "string" ? replacement.replace(",", "") : replacement;
      replacements[`{${key}}`] = repValue;
    });
    let updatedData = templateContent.replace(
      new RegExp(keys.map((key) => `{${key.toUpperCase()}}`).join("|"), "g"),
      (matched) => replacements[matched.toLowerCase()]
    );
    if (data?.items) {
      updatedData = replaceItems(updatedData, data?.items);
    }

    newDivs += updatedData;
  });
  logger.info("end page generate dataList");

  // Insert the new divs into page-container
  htmlContent = htmlContent.replace('{bodyContent}', `${newDivs}`);

  logger.info("End html generate");
  const puppeteerOptions = getPuppeteerOptions();
  logger.info(`Puppeteer options (getPdfByts): ${JSON.stringify(puppeteerOptions, null, 2)}`);

  let browser;
  try {
    browser = await puppeteer.launch(puppeteerOptions);
    logger.info(`Browser launched successfully (getPdfByts)`);
  } catch (error) {
    logger.error(`Failed to launch browser (getPdfByts): ${error.message}`);
    logger.error(`Error stack: ${error.stack}`);
    logger.error(`Full error object: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`);
    throw error;
  }

  logger.info(`open browser`);
  const page = await browser.newPage();
  //await page.setContent(htmlContent);
  await page.setContent(htmlContent, { waitUntil: 'networkidle0' });


  logger.info("Set content");

  // Optimize PDF generation with compression settings
  const optimizedOptions = {
    ...option,
    scale: 0.8,  // Reduce scale to 80% for smaller file size
    preferCSSPageSize: true,
    displayHeaderFooter: false,
    margin: {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    }
  };

  const pdfBuffer = await page.pdf(optimizedOptions);
  // Generate PDF filename with timestamp
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5); // Remove milliseconds

  // Generate filename
  const certificateTypes = {
      1: 'Certificate_of_Achievement',
      2: 'Work_Ready_Skills_L2_Micro_Credential',
      3: 'Employment_Skills_L3_Micro_Credential',
      4: 'Foundation_Skills_L1',
      5: 'Foundation_Skills_L2'
  };

  const pdfFileName = `${certificateTypes[type]}_${timestamp}.pdf`;

  // Save PDF to the same directory as the script
  const pdfPath = path.join(__dirname, pdfFileName);
  await fs.promises.writeFile(pdfPath, pdfBuffer);
  logger.info(`PDF saved to: ${pdfPath}`);
  logger.info(`Generated PDF size: ${(pdfBuffer.length / 1024).toFixed(2)} KB (${dataList.length} page${dataList.length > 1 ? 's' : ''})`);
  logger.info("create pdf buffer");
  // const buffer = Buffer.from(pdfBuffer);
  await browser.close();
  logger.info("Close browser and return file");
  return pdfFileName;
}

async function generateCertificates(dataList) {
  if (!Array.isArray(dataList)) return [];
  var certificateName = "All";
  var data = [""]
  const results = await asyncMap(data, async (d) => {
    return {
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: `Certificate_${certificateName}.pdf`,
      contentType: "application/pdf",
      contentBytes: await handles(dataList,
        "AchievementCertificatev1.html", "AchievementCertificatev1Content.html",
        {
          width: "297mm",
          height: "210mm",
          border: "0",
          pageRanges: `1-${dataList.length}`,
          printBackground: true,
        }
      ),
    };
  });
  return results;
}

async function generateCertificateMicro(data) {
  if (!Array.isArray(data)) return [];
  const results = await asyncMap(data, async (d) => {
    return {
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: `Micro-Credential_${d.learnerName}.pdf`,
      contentType: "application/pdf",
      contentBytes: await handle(
        {
          LEARNER: d.learnerName,
          Date1: d.date1,
          Date2: d.date2,
          COURSE: d.course,
          lv: d.lv,
        },
        "MicroCredential.html",
        {
          width: "238mm",
          height: "168mm",
          border: "0",
          pageRanges: "1",
          printBackground: true,
        }
      ),
    };
  });
  return results;
}

module.exports = {
  generateCertificate,
  generateCertificates,
  generateAllCertificates,
  generateCertificateMicro,
  generateAllPdfCertificates,
};
