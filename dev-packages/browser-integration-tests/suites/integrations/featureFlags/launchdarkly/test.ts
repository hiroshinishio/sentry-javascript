import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';

import { envelopeRequestParser, waitForErrorRequest } from '../../../../utils/helpers';
// import { FLAG_BUFFER_SIZE } from '@sentry/browser'; // TODO: not picking up export atm
const FLAG_BUFFER_SIZE = 100;

sentryTest('e2e test', async ({ getLocalTestPath, page }) => {
  await page.route('https://dsn.ingest.sentry.io/**/*', route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'test-id' }),
    });
  });

  const url = await getLocalTestPath({ testDir: __dirname, skipDsnRouteHandler: true });
  await page.goto(url);

  await page.waitForFunction(() => {
    const ldClient = (window as any).InitializeLD();
    for (let i = 1; i <= FLAG_BUFFER_SIZE; i++) { // TODO: import constant for buffer size
      ldClient.variation(`feat${i}`, false);
    }
    ldClient.variation(`feat${FLAG_BUFFER_SIZE+1}`, true); // eviction
    ldClient.variation('feat3', true);   // update
    return true;
  });

  const reqPromise = waitForErrorRequest(page);
  await page.locator('#error').click();
  const req = await reqPromise;
  const event = envelopeRequestParser(req);

  const expectedFlags = [{ flag: 'feat2', result: false }];
  for (let i = 4; i <= FLAG_BUFFER_SIZE; i++) {
    expectedFlags.push({ flag: `feat${i}`, result: false });
  }
  expectedFlags.push({ flag: `feat${FLAG_BUFFER_SIZE + 1}`, result: true });
  expectedFlags.push({ flag: 'feat3', result: true });

  expect(event.contexts?.flags?.values).toEqual(expectedFlags);
});
