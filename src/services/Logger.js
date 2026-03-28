import winston from 'winston';
import chalk from 'chalk';
import { mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { ROOT_DIR } from '../config/default.js';

const { combine, timestamp, printf } = winston.format;

const levelColors = {
  error: chalk.red,
  warn: chalk.yellow,
  info: chalk.cyan,
  debug: chalk.gray,
};

function createLogger(config) {
  const logDir = resolve(ROOT_DIR, config.logging.logDir);
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }

  const consoleFormat = printf(({ level, message, timestamp, profile }) => {
    const colorFn = levelColors[level] || chalk.white;
    const prefix = profile ? chalk.magenta(`[${profile}]`) : '';
    const ts = chalk.gray(timestamp.split('T')[1].split('.')[0]);
    return `${ts} ${colorFn(level.toUpperCase().padEnd(5))} ${prefix} ${message}`;
  });

  const fileFormat = printf(({ level, message, timestamp, profile }) => {
    const prefix = profile ? `[${profile}]` : '';
    return `${timestamp} ${level.toUpperCase().padEnd(5)} ${prefix} ${message}`;
  });

  const logger = winston.createLogger({
    level: config.logging.level,
    format: combine(timestamp()),
    transports: [
      new winston.transports.Console({
        format: consoleFormat,
      }),
      new winston.transports.File({
        filename: resolve(logDir, 'app.log'),
        format: fileFormat,
        maxsize: 5 * 1024 * 1024,
        maxFiles: 3,
      }),
      new winston.transports.File({
        filename: resolve(logDir, 'error.log'),
        level: 'error',
        format: fileFormat,
        maxsize: 5 * 1024 * 1024,
        maxFiles: 3,
      }),
    ],
  });

  return logger;
}

// Create a child logger for a specific profile
function profileLogger(logger, profileName) {
  return logger.child({ profile: profileName });
}

let _logger = null;

export function initLogger(config) {
  _logger = createLogger(config);
  return _logger;
}

export function getLogger() {
  if (!_logger) {
    throw new Error('Logger not initialized. Call initLogger(config) first.');
  }
  return _logger;
}

export { profileLogger };
