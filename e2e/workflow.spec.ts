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

  await page.getByRole('button', { name: 'Suggest track' }).click();
  await expect(page.locator('.job-result')).toContainText('COMPLETED');
  await expect(page.locator('.job-result')).toContainText('Experimental motion');
  await expect(page.getByLabel('Delivery label', { exact: true })).toHaveValue(
    'Corrected first ball',
  );
  // Exportable saved state is unaffected by generating suggestions.
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeDisabled();
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
