import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  integrations: [
    nodeProfilingIntegration(),
    // Remove expressIntegration if using automatic integrations
  ],
  tracesSampleRate: 1.0,
  enableTracing: true,
  profilesSampleRate: 1.0,
  debug: process.env.NODE_ENV !== "production",
  // Other configurations...
});
