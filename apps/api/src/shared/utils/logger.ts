import { envs } from "../config/envs";

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  traceId?: string;
  [key: string]: unknown;
}

const isProd = envs.app.NODE_ENV === "prod";

function formatLog(entry: LogEntry): string {
  if (isProd) {
    return JSON.stringify(entry);
  }
  const { level, message, timestamp, traceId, ...extra } = entry;
  const traceStr = traceId ? ` [${traceId}]` : "";
  const extraStr =
    Object.keys(extra).length > 0 ? ` ${JSON.stringify(extra)}` : "";
  return `${timestamp} [${level.toUpperCase()}]${traceStr} ${message}${extraStr}`;
}

function createLogFn(level: LogLevel) {
  const consoleFn =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : console.log;

  return (message: string, extra?: Record<string, unknown>) => {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...extra,
    };
    consoleFn(formatLog(entry));
  };
}

export const logger = {
  debug: createLogFn("debug"),
  info: createLogFn("info"),
  warn: createLogFn("warn"),
  error: createLogFn("error"),

  child(context: Record<string, unknown>) {
    return {
      debug: (msg: string, extra?: Record<string, unknown>) =>
        logger.debug(msg, { ...context, ...extra }),
      info: (msg: string, extra?: Record<string, unknown>) =>
        logger.info(msg, { ...context, ...extra }),
      warn: (msg: string, extra?: Record<string, unknown>) =>
        logger.warn(msg, { ...context, ...extra }),
      error: (msg: string, extra?: Record<string, unknown>) =>
        logger.error(msg, { ...context, ...extra }),
    };
  },
};
