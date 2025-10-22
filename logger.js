const { createLogger, format, transports } = require("winston");
require("winston-daily-rotate-file");

const dailyRotate = new transports.DailyRotateFile({
  filename: "logs/app-%DATE%.log",
  datePattern: "YYYY-MM-DD",
  zippedArchive: true,
  maxSize: "20m",
  maxFiles: "30d", // keep logs for 14 days
});

const logger = createLogger({
  level: "debug", // log everything from debug and above
  format: format.combine(
    format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    format.printf(({ level, message, timestamp }) => {
      return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    })
  ),
  transports: [
    new transports.Console(), // also log to console
    dailyRotate,              // rotate daily log files
  ],
});

module.exports = logger;
