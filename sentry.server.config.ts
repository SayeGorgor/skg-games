import { beforeSendLog } from "./src/lib/observability/logs";

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  beforeSendLog,
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Sample 10% of production transactions.
  // Capture all development transactions.
  tracesSampleRate:
    process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  dataCollection: {
    userInfo: false,

    // Avoid collecting sensitive request information.
    httpHeaders: false,
    cookies: false,
    urlQueryParams: false,
    httpBodies: [],

    // Avoid collecting sensitive database information.
    databaseQueryData: false,
    queues: false,

    // Do not include local variable values in stack frames.
    stackFrameVariables: false,

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
