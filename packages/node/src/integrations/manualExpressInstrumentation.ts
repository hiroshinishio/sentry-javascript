import * as Sentry from '@sentry/node';

export function instrumentExpressManually(): void {
  try {
    const express = require('express');
    const { instrument } = require('@sentry/integrations/build/cjs/express');
    if (express && !express.__sentry_instrumented__) {
      instrument(express);
      express.__sentry_instrumented__ = true;
    }
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Failed to manually instrument Express:', e);
    }
  }
}