import { beforeSendLog } from "./src/lib/observability/logs";

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  beforeSendLog,
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Sample 10% of production transactions.
  // Capture all development transactions.
  tracesSampleRate:
    process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Restrict automatic collection of sensitive information.
  dataCollection: {
    userInfo: false,

    // Do not collect authentication or request data.
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,

    // Do not collect database query values or task payloads.
    databaseQueryData: false,
    queues: false,

    // Do not collect local variable values in stack frames.
    stackFrameVariables: false,

    // Disable unnecessary integrations' content collection.
    graphQL: {
      document: false,
      variables: false,
    },
    genAI: {
      inputs: false,
      outputs: false,
    },
  },
});

