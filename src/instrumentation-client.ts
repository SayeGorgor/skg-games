import { beforeSendLog } from "./lib/observability/logs";

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  beforeSendLog,
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Reduce production performance monitoring volume.
  tracesSampleRate:
    process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Session Replay is disabled initially.

  dataCollection: {
    userInfo: false,

    // Disable automatic request data collection.
    httpHeaders: false,
    cookies: false,
    urlQueryParams: false,
    httpBodies: [],

    databaseQueryData: false,
    queues: false,
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

// Preserve Next.js client-side navigation tracing.
export const onRouterTransitionStart =
  Sentry.captureRouterTransitionStart;
