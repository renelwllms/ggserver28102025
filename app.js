const express = require("express");
const bodyParser = require("body-parser");
const compression = require("compression");
const logger = require("./logger");
const cors = require("cors");
const path = require('path');
const multer = require('multer');
const student = require("./routes/student");
const tutor = require("./routes/tutor");
const course = require("./routes/course");
const report = require("./routes/report");
const certificate = require("./routes/certificate");
const createError = require("http-errors");
const adminuser = require("./routes/adminUser");
const communication = require("./routes/communication");
const communicationType = require("./routes/communicationType");
const microcredential = require("./routes/microcredential");

const app = express();
// Enable gzip compression for all responses
app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false; // Don't compress if this request header is present
    }
    return compression.filter(req, res); // Use default compression filter
  },
  level: 6 // Compression level (0-9, where 6 is default balance between speed and compression)
}));
app.use(bodyParser.json());
const PORT = 5000;
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({extended:true}));


// === Helper function to sanitize sensitive data ===
function sanitizeData(data) {
  if (!data || typeof data !== 'object') return data;

  const sensitiveFields = ['password', 'token', 'authorization', 'secret', 'apikey'];
  const sanitized = Array.isArray(data) ? [...data] : { ...data };

  for (const key in sanitized) {
    const lowerKey = key.toLowerCase();
    if (sensitiveFields.some(field => lowerKey.includes(field))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      sanitized[key] = sanitizeData(sanitized[key]);
    }
  }

  return sanitized;
}

// === Helper function to get response summary ===
function getResponseSummary(body, statusCode) {
  if (!body) return 'Empty';

  const size = Buffer.byteLength(body, 'utf8');

  // For errors, include error details
  if (statusCode >= 400) {
    const preview = body.substring(0, 500);
    return `Size: ${size} bytes, Error: ${preview}${size > 500 ? '...' : ''}`;
  }

  // For success, just show size and data count if applicable
  try {
    const parsed = JSON.parse(body);
    if (parsed.data && Array.isArray(parsed.data)) {
      return `Size: ${size} bytes, Records: ${parsed.data.length}`;
    }
    if (parsed.pagination) {
      return `Size: ${size} bytes, Page: ${parsed.pagination.current}/${Math.ceil(parsed.pagination.total / parsed.pagination.pageSize)}, Total: ${parsed.pagination.total}`;
    }
    return `Size: ${size} bytes`;
  } catch {
    return `Size: ${size} bytes`;
  }
}

// === Logging Middleware for Request & Response ===
app.use((req, res, next) => {
  const start = Date.now();
  const chunks = [];

  const oldWrite = res.write;
  const oldEnd = res.end;

  res.write = function (chunk, ...args) {
    chunks.push(Buffer.from(chunk));
    oldWrite.apply(res, [chunk, ...args]);
  };

  res.end = function (chunk, ...args) {
    if (chunk) chunks.push(Buffer.from(chunk));
    const responseBody = Buffer.concat(chunks).toString("utf8");
    const duration = Date.now() - start;

    // Skip detailed logging for 304 Not Modified responses
    if (res.statusCode === 304) {
      oldEnd.apply(res, [chunk, ...args]);
      return;
    }

    // Clone headers without sensitive data
    const safeHeaders = { ...req.headers };
    delete safeHeaders["authorization"];
    delete safeHeaders["cookie"];

    // Try to get username (from auth middleware if set)
    const username =
      req.info?.displayName ||
      req.info?.userPrincipalName ||
      req.info?.mail ||
      "Unknown User";

    // Sanitize request body
    const sanitizedBody = sanitizeData(req.body);

    // Get response summary instead of full body
    const responseSummary = getResponseSummary(responseBody, res.statusCode);

    // Determine log level based on status code and duration
    let logLevel = 'info';
    if (res.statusCode >= 500) {
      logLevel = 'error';
    } else if (res.statusCode >= 400) {
      logLevel = 'warn';
    } else if (duration > 3000) {
      logLevel = 'warn'; // Slow query warning
    }

    const logMessage = `
User: ${username}
Request: ${req.method} ${req.originalUrl}
Body: ${Object.keys(sanitizedBody).length > 0 ? JSON.stringify(sanitizedBody) : 'Empty'}
Response: Status ${res.statusCode}, ${responseSummary}
Time: ${duration}ms${duration > 3000 ? ' ⚠️ SLOW' : ''}
------------------------------
`;

    logger[logLevel](logMessage);

    oldEnd.apply(res, [chunk, ...args]);
  };

  next();
});



app.use("/api/student", student);
app.use("/api/tutor", tutor);
app.use("/api/course", course);
app.use("/api/report", report);
app.use("/api/certificate", certificate);
app.use("/api/AdminUser", adminuser);
app.use("/api/communication", communication);
app.use("/api/communicationType", communicationType);
app.use("/api/microcredential", microcredential);


const uploadPath = path.join(__dirname, "/routes/uploadDoc");
app.use("/api/images", (req, res, next) => {
  if(["POST", "PUT", "DELETE", "PATCH"].includes(req.method)){
    return res.status(405).send("Method Not Allowed");
  }
  next();
})
app.use("/api/images", express.static(uploadPath));


// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Catch-all route to handle any unmatched requests, serving the front-end app
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(function (req, res, next) {
  next(createError(404));
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
