import path from 'path';

import { app } from 'electron';
import winston from 'winston';
// import { sendMessageToRenderer } from './main';

const IS_DEVELOPMENT = app?.isPackaged || process.env.NODE_ENV === 'development';

export interface LogOptions {
  preventLoggingToConsole?: boolean;
  sendToRenderer?: MessageToRendererProps;
}

// type LogType = 'MAIN' | 'UI';

// const defaultLogOptions: LogOptions = {
//   preventLoggingToConsole: false
// };

export type LogMessageTypes = 'INFO' | 'WARN' | 'ERROR';

// const objectToString = (obj?: Record<string, unknown>) => {
//   if (obj) {
//     for (const x of Object.keys(obj)) {
//       const property = obj[x];
//       if (property instanceof Error) {
//         obj[x] = `${property.message}\r${property.stack}`;
//       }
//     }

//     const str = JSON.stringify(obj);
//     return str;
//   }
//   return '';
// };

const getMinTwoWidthNums = (num: number) => {
  if (num >= 10) return num.toString();
  return `0${num}`;
};

const getLogFilePath = () => {
  const baseDir = process.env.NORA_USER_DATA || app?.getPath('userData');
  const logSaveFolder = path?.join(baseDir, 'logs');

  const date = new Date();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = date.getFullYear();
  const formattedDate = `${year}-${getMinTwoWidthNums(month)}-${getMinTwoWidthNums(day)}`;

  const appState = IS_DEVELOPMENT ? 'dev' : 'prod';
  const logFileName = `${formattedDate}.${appState}.log.txt`;

  const logFilePath = path?.join(logSaveFolder, logFileName);
  return logFilePath;
};

export const logFilePath = getLogFilePath();

const getConsoleLogLevel = () => {
  if (process.env.CONSOLE_LOG_LEVEL) {
    return process.env.CONSOLE_LOG_LEVEL;
  }
  return IS_DEVELOPMENT ? 'info' : 'warn';
};

const DEFAULT_FILE_LEVEL = 'silly';
const DEFAULT_CONSOLE_LEVEL = getConsoleLogLevel();

const transports = {
  console: new winston.transports.Console({
    level: DEFAULT_CONSOLE_LEVEL,
    format: winston.format.combine(
      winston.format.timestamp({
        format: 'YYYY-MM-DD hh:mm:ss.SSS A'
      }),
      winston.format.json({ deterministic: true }),
      winston.format.colorize({ all: true }),
      winston.format.simple()
    )
  }),
  file: new winston.transports.File({
    level: DEFAULT_FILE_LEVEL,
    filename: logFilePath
  })
};

const log = winston.createLogger({
  transports: [transports.console, transports.file]
});
//   message: Error | string,
//   data?: Record<string, unknown>,
//   messageType: LogMessageTypes = 'INFO',
//   logOptions?: LogOptions,
//   logType: LogType = 'MAIN'
// ) => {
//   let mes: string;

//   if (message instanceof Error) mes = message.message;
//   else mes = message.replaceAll('\n', '\n\t');

//   const options: LogOptions = { ...defaultLogOptions, ...logOptions };

//   if (options.sendToRenderer) sendMessageToRenderer(options.sendToRenderer);

//   if (messageType !== 'INFO') mes = mes.toUpperCase();
//   const str = `\n[${new Date().toUTCString()}] [${logType}] = ${mes}\n\t${objectToString(data)}`;
//   // appendFileSync(logFilePath, str, { encoding: 'utf-8' });

//   if (!options?.preventLoggingToConsole) {
//     if (messageType === 'ERROR') pinoLogger.error(str);
//     else if (messageType === 'WARN') pinoLogger.warn(str);
//     else pinoLogger.info(str);
//   }
// };

export const toggleVerboseLogs = (isEnabled: boolean) => {
  if (isEnabled) {
    transports.console.level = 'silly';
    transports.file.level = 'silly';
  } else {
    transports.console.level = DEFAULT_CONSOLE_LEVEL;
    transports.file.level = DEFAULT_FILE_LEVEL;
  }
};

// # NPM LOG LEVELS
//   error: 0,
//   warn: 1,
//   info: 2,
//   http: 3,
//   verbose: 4,
//   debug: 5,
//   silly: 6

export interface SerializedError {
  name?: string;
  message: string;
  stack?: string;
  code?: string | number;
  errno?: number;
  syscall?: string;
  path?: string;
  cause?: unknown;
  [key: string]: unknown;
}

export const serializeError = (err: unknown): SerializedError => {
  if (err instanceof Error) {
    const errorObj = err as any;
    const serialized: SerializedError = {
      name: errorObj.name,
      message: errorObj.message,
      stack: errorObj.stack
    };
    if (errorObj.code !== undefined) serialized.code = errorObj.code;
    if (errorObj.errno !== undefined) serialized.errno = errorObj.errno;
    if (errorObj.syscall !== undefined) serialized.syscall = errorObj.syscall;
    if (errorObj.path !== undefined) serialized.path = errorObj.path;
    if (errorObj.cause !== undefined) {
      serialized.cause =
        errorObj.cause instanceof Error ? serializeError(errorObj.cause) : errorObj.cause;
    }
    return serialized;
  }
  if (typeof err === 'object' && err !== null) {
    return { ...(err as Record<string, unknown>), message: (err as any).message || String(err) };
  }
  return { message: String(err) };
};

export const normalizeErrorPayload = (
  data?: Record<string, unknown> | unknown,
  explicitError?: unknown
): { data: Record<string, unknown>; errorMessage: string } => {
  let errorMessage: string | undefined;
  const resultData: Record<string, unknown> = {};

  if (data instanceof Error) {
    errorMessage = data.message;
    resultData.error = serializeError(data);
  } else if (typeof data === 'object' && data !== null) {
    const dataObj = data as Record<string, unknown>;
    for (const [key, value] of Object.entries(dataObj)) {
      if (key === 'error' && value !== undefined) {
        if (!errorMessage) {
          errorMessage =
            value instanceof Error
              ? value.message
              : typeof value === 'object' && value !== null && 'message' in value
                ? String((value as any).message)
                : String(value);
        }
        resultData.error = serializeError(value);
      } else {
        resultData[key] = value instanceof Error ? serializeError(value) : value;
      }
    }
  } else if (data !== undefined) {
    resultData.data = data;
  }

  if (explicitError !== undefined) {
    if (!errorMessage) {
      errorMessage = explicitError instanceof Error ? explicitError.message : String(explicitError);
    }
    resultData.error = serializeError(explicitError);
  }

  return {
    data: resultData,
    errorMessage: errorMessage || 'Unknown error'
  };
};

export interface Logger {
  info: (message: string, data?: object) => void;
  error: {
    (message: string): void;
    (message: string, error: unknown): void;
    (message: string, data: Record<string, unknown>, error?: unknown): void;
  };
  warn: (message: string, data?: object) => void;
  debug: (message: string, data?: object) => void;
  silly: (message: string, data?: object) => void;
  verbose: (message: string, data?: object) => void;
}

const logger: Logger = {
  info: (message: string, data = {} as object) => {
    log.info(message, { process: 'MAIN', data });
  },
  error: (message: string, dataOrError: unknown = {}, explicitError?: unknown) => {
    const { data, errorMessage } = normalizeErrorPayload(dataOrError, explicitError);
    log.error(message, { process: 'MAIN', error: errorMessage, data });
  },
  warn: (message: string, data = {} as object) => {
    log.warn(message, { process: 'MAIN', data });
  },
  debug: (message: string, data = {} as object) => {
    log.debug(message, { process: 'MAIN', data });
  },
  silly: (message: string, data = {} as object) => {
    log.silly(message, { process: 'MAIN', data });
  },
  verbose: (message: string, data = {} as object) => {
    log.verbose(message, { process: 'MAIN', data });
  }
};

export default logger;
