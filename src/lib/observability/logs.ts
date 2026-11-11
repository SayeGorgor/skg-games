import type { Log } from "@sentry/nextjs";

/** v11 logs are opt-in by usage. Do not add console logging integrations. */
export function beforeSendLog(log: Log): Log | null {
  if (
    process.env.NODE_ENV === "production" &&
    (log.level === "trace" || log.level === "debug")
  )
    return null;
  return log;
}
