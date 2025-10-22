const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");
const logger = require("../log/logger");
// Load the Word template

async function asyncMap(array, asyncCallback) {
  const promises = array.map(async (item, index) => {
    return await asyncCallback(item, index, array);
  });
  return Promise.all(promises);
}

async function generateWorkshopResults(dataList) {
  if (!Array.isArray(dataList)) return [];
  var certificateName = dataList.length > 1? "All_" : "";
  var data = [""]
  const results = await asyncMap(data, async (d) => {
    return {
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: `${certificateName}Certificate.pdf`,
      contentType: "application/pdf",
      contentBytes: await handles(dataList, `RemoteLearner.html`, 
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

// Prepare a function to replace the variables and generate new documents
async function handleRemoteLerner(data, option) {
  logger.info("Start handles");
  const template = "RemoteLearner.html";
  const templatePath = path.join(__dirname, template);
  logger.info(`templatePath path : ${templatePath}`);
  const templatePageContent = await fs.promises.readFile(templatePath, "utf8");
  logger.info(`Read file from above path`);
  let htmlContent = templatePageContent;
  logger.info("htmlContent varible create");
  if(data) {
    const keys = Object.keys(data).filter((e) => e !== "items");
    const values = Object.values(data).filter((e) => e !== "items");
    const replacements = {};
    keys.forEach((key, index) => {
      const replacement =  values[index];
      var repValue = typeof replacement === "string" ? replacement.replace(",", "") : replacement;
      replacements[`{${key}}`] = repValue;
    });
    htmlContent = htmlContent.replace(
      new RegExp(keys.map((key) => `{${key.toUpperCase()}}`).join("|"), "g"),
      (matched) => {
        console.log("matched");
        console.log(matched);
        return replacements[matched.toLowerCase()];
      } 
    );
    if (data?.items) {
      let itemHtml = "";
      data?.items.forEach((item) => {
        itemHtml += `
        <tr>
          <td>${item.US} ${item.Version? ' - V'+  item.Version : ''}</td>
          <td>${item.status}</td>
        </tr>`;
      });      
      htmlContent = htmlContent.replace("{#items}", itemHtml);
    }
  };
  logger.info("end page generate dataList");
  logger.info("End html generate");
  const browser = await puppeteer.launch({
    headless: true,
    args:["--no-sandbox", "--disable-setuid-sandbox"]
  });
  logger.info(`open browser`);
  const page = await browser.newPage();
  await page.setContent(htmlContent);

  logger.info("Set content");
  const pdfBuffer = await page.pdf(option);

  logger.info("create pdf buffer");
  const buffer = Buffer.from(pdfBuffer);
  await browser.close();
  logger.info("Close browser and return file");
  return buffer.toString('base64')
}

async function generateRemotLearneResult(dataList) {
  var certificateName = "All";
  var data = [""];
  logger.info(`Data count : ${dataList.items?.length}`);  
  var pageSize = dataList.items?.length;
  logger.info(`pageSize : ${pageSize}`);
  pageSize = (pageSize / 16) > 0? Math.ceil(pageSize / 16) + 1 : 1;
  logger.info(`pageSize : ${pageSize}`);
  const results = await asyncMap(data, async (d) => {
  logger.info(`Data count : ${dataList.items?.length}`);
    return {
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: `${dataList.learnername || 'RemoteLearner'}_result.pdf`,
      contentType: "application/pdf",
      contentBytes: await handleRemoteLerner(dataList, {
          width: "297mm",
          height: "210mm",
          border: "0",
          pageRanges: `1-${pageSize}`,
          printBackground: true,
        }
      ),
    };
  });
  return results;
}

async function generateWorkshopResult(dataList) {
  var certificateName = dataList.code|| "WorkshopResults";
  var data = [""];  
  logger.info(`Data count : ${dataList.items?.length}`);
  var pageSize = dataList.items?.length;
  pageSize = (pageSize / 16) > 0? Math.ceil(pageSize / 16) + 1 : 1;
  logger.info(`pageSize : ${pageSize}`);
  const results = await asyncMap(data, async (d) => {
    return {
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: `${certificateName}.pdf`,
      contentType: "application/pdf",
      contentBytes: await handleWorkshopResult(dataList, {
          width: "297mm",
          height: "210mm",
          border: "0",
          pageRanges: `1-${pageSize}`,
          printBackground: true,
        }
      ),
    };
  });
  return results;
}

// Prepare a function to replace the variables and generate new documents
async function handleWorkshopResult(data, option) {
  logger.info("Start handles");
  const template = "Workshop.html";
  const templatePath = path.join(__dirname, template);
  logger.info(`templatePath path : ${templatePath}`);
  const templatePageContent = await fs.promises.readFile(templatePath, "utf8");
  logger.info(`Read file from above path`);

  let htmlContent = templatePageContent;
  logger.info("htmlContent varible create");
  if(data) {
    const keys = Object.keys(data).filter((e) => e !== "items");
    const values = Object.values(data).filter((e) => e !== "items");
    const replacements = {};
    keys.forEach((key, index) => {
      const replacement =  values[index];
      var repValue = typeof replacement === "string" ? replacement.replace(",", "") : replacement;
      replacements[`{${key}}`] = repValue;
    });
    htmlContent = htmlContent.replace(
      new RegExp(keys.map((key) => `{${key.toUpperCase()}}`).join("|"), "g"),
      (matched) => {
        return replacements[matched.toLowerCase()];}
    );
    if (data?.items) {  
      let headerHtml = '<tr>';
      const excludeKeys = ['learnerName', 'date', 'StudentID', 'FirstName', 'LastName'];
      let keys = ['FirstName', 'LastName'];
      if(data.items.length > 0){
        var unitkeys = Object.keys(data.items[0]).filter(key => !excludeKeys.includes(key));
        keys = [...keys, ...unitkeys];
        headerHtml += `<th>First Name</th>`;
        headerHtml += `<th>Last Name</th>`;
        unitkeys.forEach(key => {
          var column  = data.columns.filter(itm => itm.US === String(key));          
          if(column.length > 0){
            headerHtml += `<th>${column[0].US}-V${column[0].USVersion}</th>`;
          }
        });
      }
      headerHtml += '</tr>';

      let itemsHtml = "";
      data?.items.forEach((item) => {
        let rowHtml = '<tr>';
        keys.forEach(key => {
          rowHtml += `<td>${item[key] ?? ''}</td>`;
        });
        rowHtml += '</tr>';

        itemsHtml += rowHtml;
      });      
      htmlContent = htmlContent.replace("{#headers}", headerHtml);
      htmlContent = htmlContent.replace("{#items}", itemsHtml);
    }
  };
  logger.info("end page generate dataList");
  logger.info("End html generate");
  const browser = await puppeteer.launch({
    headless: true,
    args:["--no-sandbox", "--disable-setuid-sandbox"]
  });
  logger.info(`open browser`);
  const page = await browser.newPage();
  await page.setContent(htmlContent);

  logger.info("Set content");
  const pdfBuffer = await page.pdf(option);

  logger.info("create pdf buffer");
  const buffer = Buffer.from(pdfBuffer);
  await browser.close();
  logger.info("Close browser and return file");
  return buffer.toString('base64')
}

module.exports = {
  generateRemotLearneResult,
  generateWorkshopResult,
};
