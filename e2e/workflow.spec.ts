import { test, expect } from '@playwright/test';

test('demo, manual correction, persistence, map, exports, and tracking', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Every delivery/ })).toBeVisible();
  await page.getByRole('button', { name: 'Explore the demo' }).click();
  await expect(page.getByRole('heading', { name: 'Evening nets / demo' })).toBeVisible();
  await expect(page.getByRole('img', { name: /Recording frame/ })).toBeVisible();
  await expect(page.getByRole('img', { name: /Recording frame/ })).toHaveJSProperty(
    'complete',
    true,
  );

  await page.getByRole('button', { name: 'Mark bounce' }).click();
  const stage = page.getByLabel('Video annotation surface');
  const box = (await stage.boundingBox())!;
  await stage.click({ position: { x: box.width * 0.51, y: box.height * 0.53 } });
  await page.getByLabel('Review status', { exact: true }).selectOption('reviewed');
  await page.getByLabel('Delivery label', { exact: true }).fill('Corrected first ball');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status')).toContainText('Saved revision 1');
  await page.reload();
  // Sessions are explicitly chosen after a reload; nothing depends on localStorage.
  await page.getByRole('button', { name: /Evening nets \/ demo/ }).click();
  await expect(
    page.getByRole('button', { name: '01 Corrected first ball', exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Review status', { exact: true })).toHaveValue('reviewed');
  await expect(
    page.getByRole('img', { name: 'Pitch map. Length in metres from batter end toward bowler.' }),
  ).toBeVisible();

  const [csvDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Session CSV' }).click(),
  ]);
  expect(csvDownload.suggestedFilename()).toBe('crease-lab-deliveries.csv');
  const [pngDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Session PNG' }).click(),
  ]);
  expect(pngDownload.suggestedFilename()).toBe('crease-lab-pitch-map.png');

  await page.getByRole('button', { name: 'Analyze delivery' }).click();
  await page.getByRole('button', { name: 'Find ball automatically', exact: true }).click();
  await expect(page.locator('.job-result')).toContainText('COMPLETED');
  await expect(page.locator('.job-result')).toContainText(/Experimental (motion|appearance)/);
  await expect(page.getByLabel('Delivery label', { exact: true })).toHaveValue(
    'Corrected first ball',
  );
  // Analysis loads a draft automatically while preserving the reviewed manual contact.
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled();
  await expect(page.getByLabel('Review status', { exact: true })).toHaveValue('reviewed');
});

test('import, calibrate, create delivery, mark contact, and filter', async ({ page, request }) => {
  const demoResponse = await request.post('/api/sessions/demo');
  const demo = await demoResponse.json();
  // Create a real MP4 upload from the synthetic generator via the API's owned copy.
  // A tiny fixture is generated independently for browser upload by the setup script.
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('e2e/fixtures/practice.mp4');
  await expect(page.getByRole('heading', { name: 'practice', exact: true })).toBeVisible();
  const image = page.getByRole('img', { name: /Recording frame/ });
  await expect(image).toHaveJSProperty('complete', true);
  await page.getByRole('button', { name: 'Calibrate', exact: true }).click();
  const stage = page.getByLabel('Video annotation surface');
  const box = (await stage.boundingBox())!;
  for (const [x, y] of [
    [0.43, 0.32],
    [0.57, 0.32],
    [0.83, 0.96],
    [0.17, 0.96],
  ]) {
    await stage.click({ position: { x: box.width * x, y: box.height * y } });
  }
  await page.getByRole('button', { name: 'Apply calibration' }).click();
  await page.getByRole('button', { name: 'Add delivery here' }).click();
  await page.getByRole('button', { name: 'Mark bounce' }).click();
  await stage.click({ position: { x: box.width * 0.5, y: box.height * 0.5 } });
  await page.getByLabel('Review status', { exact: true }).selectOption('reviewed');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status')).toContainText('Saved revision 1');
  await page.getByLabel('Filter review status').selectOption('unresolved');
  await expect(page.getByText('No deliveries match these filters.')).toBeVisible();
  await page.getByLabel('Filter review status').selectOption('reviewed');
  await expect(page.getByRole('button', { name: /Delivery 01/ }).first()).toBeVisible();
  await request.delete(`/api/sessions/${demo.id}`);
});

test('mobile workspace fits the viewport', async ({ page, request }) => {
  const response = await request.post('/api/sessions/demo');
  const demo = await response.json();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  // Open through API-independent desktop session list before shrinking is not needed:
  // import controls remain accessible on the welcome screen at this viewport.
  await page.getByRole('button', { name: 'Explore the demo' }).click();
  await expect(page.getByRole('heading', { name: 'Evening nets / demo' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await request.delete(`/api/sessions/${demo.id}`);
});

test('automatic analysis finds a bounce and maps it without manual ball or bounce marks', async ({
  page,
}) => {
  const analysisRequests: { seed: unknown }[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/jobs'))
      analysisRequests.push(request.postDataJSON());
  });
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('e2e/fixtures/bounce.mp4');
  await expect(page.getByRole('heading', { name: 'bounce', exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: /Recording frame/ })).toHaveJSProperty(
    'complete',
    true,
  );
  await page.getByRole('button', { name: 'Calibrate', exact: true }).click();
  const stage = page.getByLabel('Video annotation surface');
  const box = (await stage.boundingBox())!;
  for (const [x, y] of [
    [0.1, 0.1],
    [0.9, 0.1],
    [0.9, 0.9],
    [0.1, 0.9],
  ])
    await stage.click({ position: { x: box.width * x, y: box.height * y } });
  await page.getByRole('button', { name: 'Apply calibration' }).click();
  await page.getByRole('button', { name: 'Add delivery here' }).click();
  await page.getByRole('button', { name: 'Analyze delivery' }).click();
  await page.getByRole('button', { name: 'Find ball automatically', exact: true }).click();
  await expect(page.locator('.contact-result')).toContainText('Bounce candidate');
  await expect(page.getByLabel('Review status', { exact: true })).toHaveValue('estimated');
  await expect(page.getByRole('img', { name: 'Recording frame 18', exact: true })).toBeVisible();
  await expect(page.locator('.contact-result')).toContainText('Estimated line:');
  await expect(page.locator('.map-point[data-selected=true]')).toBeVisible();
  await page.getByRole('button', { name: 'Session overview', exact: true }).click();
  await expect(page.locator('.metric').first()).toContainText('1 ground estimates');
  await page.getByRole('button', { name: 'Analyze delivery', exact: true }).click();
  await page.getByRole('button', { name: 'Find ball automatically', exact: true }).click();
  await expect.poll(() => analysisRequests.length).toBe(2);
  expect(analysisRequests[1].seed).toBeNull();
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status')).toContainText('Saved revision');
});

test('ball selection is provisional, confirmed seed tracks forward, and image contact opens evidence', async ({
  page,
}) => {
  const jobs: { seed: { frame: number; x: number; y: number } }[] = [];
  let saves = 0;
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().endsWith('/jobs')) jobs.push(r.postDataJSON());
    if (r.method() === 'PUT') saves++;
  });
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('e2e/fixtures/bounce.mp4');
  await page.getByRole('button', { name: 'Add delivery here', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Recording frame 0', exact: true })).toHaveJSProperty(
    'complete',
    true,
  );
  await page.getByRole('button', { name: 'Analyze delivery', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start tracking', exact: true })).toBeDisabled();
  const surface = page.getByLabel('Video annotation surface');
  const box = (await surface.boundingBox())!;
  await surface.click({ position: { x: (box.width * 50) / 320, y: (box.height * 80) / 240 } });
  await expect(page.getByRole('img', { name: 'Selected ball magnified' })).toBeVisible();
  await page.screenshot({ path: 'work/ui-07-selection.png', fullPage: true });
  expect(jobs).toHaveLength(0);
  expect(saves).toBe(0);
  await page.getByRole('button', { name: 'Cancel selection', exact: true }).click();
  expect(jobs).toHaveLength(0);
  await page.getByRole('button', { name: 'Analyze delivery', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start tracking', exact: true })).toBeDisabled();
  await surface.click({ position: { x: (box.width * 50) / 320, y: (box.height * 80) / 240 } });
  await page.getByRole('button', { name: 'Start tracking', exact: true }).click();
  await expect.poll(() => jobs.length).toBe(1);
  expect(jobs[0].seed.frame).toBe(0);
  expect(jobs[0].seed.x).toBeCloseTo(50 / 320, 2);
  await expect(page.locator('.contact-result')).toContainText('Bounce candidate');
  await expect(page.locator('.map-panel .badge')).toHaveText('IMAGE POSITION');
  await page.getByRole('button', { name: 'Open bounce source frame' }).click();
  await expect(page.getByRole('img', { name: 'Recording frame 18', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm contact', exact: true }).click();
  await expect(page.getByLabel('Review status', { exact: true })).toHaveValue('reviewed');
  await page.screenshot({ path: 'work/ui-07-contact.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'work/ui-07-mobile.png', fullPage: true });
});

test('shows contact on the recording before calibration and explains a missing bounce', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles('e2e/fixtures/bounce.mp4');
  await page.getByRole('button', { name: 'Add delivery here', exact: true }).click();
  await expect(page.getByText('No bounce location yet', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Locate bounce manually', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Recording frame 0', exact: true })).toHaveJSProperty(
    'complete',
    true,
  );
  const stage = page.getByLabel('Video annotation surface');
  const box = (await stage.boundingBox())!;
  await stage.click({ position: { x: box.width * 0.5, y: box.height * 0.6 } });
  await expect(
    page.getByRole('img', { name: 'Pitch contact location on the recording' }),
  ).toBeVisible();
  await expect(page.locator('.map-panel .badge')).toHaveText('IMAGE POSITION');
  await expect(page.getByRole('button', { name: 'Show contact frame', exact: true })).toBeVisible();
});

test('unsupported-codec preview waits for frame loading instead of building a request backlog', async ({
  page,
}) => {
  await page.route('**/media', (route) => route.abort());
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore the demo', exact: true }).click();
  await expect(page.getByRole('img', { name: /Recording frame/ })).toHaveJSProperty(
    'complete',
    true,
  );
  await expect(page.getByText('Sampled preview', { exact: true })).toBeVisible();
  let active = 0,
    maxActive = 0;
  await page.route('**/frame/*', async (route) => {
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 150));
    await route.continue();
    active--;
  });
  await page.getByRole('button', { name: 'Play preview', exact: true }).click();
  await expect(page.locator('.frame-label')).not.toHaveText('F 0');
  await expect.poll(() => page.locator('.frame-label').textContent()).not.toBe('F 2');
  await page.getByRole('button', { name: 'Pause preview', exact: true }).click();
  expect(maxActive).toBeLessThanOrEqual(1);
});

test('native playback advances from the media clock without requesting JPEGs per frame', async ({
  page,
}) => {
  await page.route('**/media', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'video/webm',
      path: 'e2e/fixtures/playback.webm',
    }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore the demo', exact: true }).click();
  await expect(page.getByRole('img', { name: /Recording frame/ })).toHaveJSProperty(
    'complete',
    true,
  );
  await expect
    .poll(() => page.locator('video').evaluate((v) => (v as HTMLVideoElement).readyState))
    .toBeGreaterThanOrEqual(2);
  await page.getByLabel('Choose delivery', { exact: true }).selectOption('');
  let frames = 0;
  page.on('request', (r) => {
    if (/\/frame\/\d+/.test(r.url())) frames++;
  });
  await page.getByRole('button', { name: 'Play preview', exact: true }).click();
  await expect
    .poll(() => page.locator('video').evaluate((v) => (v as HTMLVideoElement).currentTime))
    .toBeGreaterThan(1.4);
  expect(frames).toBe(0);
  await page.getByRole('button', { name: 'Pause preview', exact: true }).click();
  await expect(page.getByRole('img', { name: /Recording frame/ })).toBeVisible();
});
