type LogMeta = Record<string, unknown>;

/** Minimal structured logger (spec section 42). Never logs secrets — callers must not pass VAPID keys, DB credentials, etc. */
function log(level: "info" | "warn" | "error", event: string, meta?: LogMeta): void {
  const line = { level, event, ts: new Date().toISOString(), ...meta };
  const out = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  out(JSON.stringify(line));
}

export const logger = {
  info: (event: string, meta?: LogMeta) => log("info", event, meta),
  warn: (event: string, meta?: LogMeta) => log("warn", event, meta),
  error: (event: string, meta?: LogMeta) => log("error", event, meta),
};
