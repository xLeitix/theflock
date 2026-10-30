import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';

test.use({ geolocation: { latitude: 57.70889, longitude: 11.91953 }, permissions: ['geolocation'] });

async function login(page: Page, persona: 'member' | 'member2' | 'moderator') {
  await page.getByTestId('demo-login').click();
  await page.getByTestId(`persona-${persona}`).click();
  await expect(page.getByTestId('account-menu')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  return (await (await page.request.get('/api/v1/session')).json()).user;
}
async function logout(page: Page) {
  await page.getByTestId('account-menu').click();
  await page.getByTestId('logout').click();
  await expect(page.getByTestId('demo-login')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function closeDialog(page: Page) {
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
}
async function noHorizontalOverflow(page: Page) {
  const sizes = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, page: document.documentElement.scrollWidth }));
  expect(sizes.page).toBeLessThanOrEqual(sizes.viewport + 1);
}
function writeResponse(page: Page, path: string) {
  return page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === path);
}
async function report(page: Page, description: string, immediately = false, comment = '') {
  await page.getByTestId('report-care').click();
  await page.getByTestId('issue-wing_injury').check();
  await page.getByTestId('urgency-today').check();
  await page.getByTestId('bird-count').fill('2');
  await page.getByTestId('care-description').fill(description);
  await expect(page.getByTestId('care-latitude')).toHaveCount(0);
  if (immediately) {
    await page.getByTestId('resolve-immediately').check();
    await page.getByTestId('resolution-comment').fill(comment);
  }
  const result = writeResponse(page, '/api/v1/care-cases');
  await page.getByTestId('save-care').click();
  const response = await result;
  expect(response.status()).toBe(201);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  return (await response.json()).case;
}

// Cleanup is restricted to each test's unique place and dependent records.
// Never drop or reseed the running interactive database.
async function cleanup(name: string) {
  const config = JSON.parse(await readFile(new URL('../../.local/runtime.json', import.meta.url), 'utf8'));
  if (config.databaseName !== 'flock_dev') throw new Error('Browser cleanup is limited to flock_dev.');
  const client = new MongoClient(config.mongoUri);
  try {
    await client.connect();
    const db = client.db(config.databaseName);
    const places = await db.collection<{ _id: string; name: string }>('places').find({ name }).toArray();
    const ids = places.map(place => place._id);
    if (!ids.length) return;
    const cases = await db.collection<{ _id: string; placeId: string }>('careCases').find({ placeId: { $in: ids } }).toArray();
    const feedings = await db.collection<{ _id: string; placeId: string }>('feedings').find({ placeId: { $in: ids } }).toArray();
    const caseIds = cases.map(item => item._id);
    const resourceIds = [...ids, ...caseIds, ...feedings.map(item => item._id)];
    await db.collection('careEvents').deleteMany({ caseId: { $in: caseIds } });
    await db.collection('careCases').deleteMany({ placeId: { $in: ids } });
    await db.collection('feedings').deleteMany({ placeId: { $in: ids } });
    await db.collection('idempotency').deleteMany({ resourceId: { $in: resourceIds } });
    await db.collection<{ _id: string }>('places').deleteMany({ _id: { $in: ids } });
  } finally { await client.close(); }
}

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
  test(`public feeding and community-care workflow at ${viewport.width}px`, async ({ page }, testInfo) => {
    const name = `E2E ${randomUUID()}`;
    const feedingComment = `Public feeding comment <b>${randomUUID()}</b>`;
    const description = `Fictional public bird report ${randomUUID()}`;
    const handledComment = `Fictional help completed ${randomUUID()}`;
    const immediateComment = `Already handled on this visit ${randomUUID()}`;
    await page.setViewportSize(viewport);
    try {
      await page.goto('/');
      await expect(page.getByTestId('selected-place-name')).toHaveText('Coop Eriksberg');
      await noHorizontalOverflow(page);
      const { places } = await (await page.request.get('/api/v1/places')).json();
      expect(places.map((place: { name: string }) => place.name)).toEqual(expect.arrayContaining(['Coop Eriksberg', 'Vårväderstorget', 'Friskväderstorget', 'Järntorget']));
      const member = await login(page, 'member');
      expect(member.roles).toEqual(['member']);
      await page.getByTestId('add-place').click();
      await expect(page.getByTestId('latitude')).toHaveValue('57.70889');
      await expect(page.getByTestId('longitude')).toHaveValue('11.91953');
      await expect(page.getByTestId('public-location-confirmed')).not.toBeChecked();
      await page.getByTestId('place-name').fill(name);
      await page.getByTestId('latitude').fill('57.7085');
      await page.getByTestId('longitude').fill('11.9750');
      await page.getByTestId('place-comment').fill('Public fictional meeting place.');
      await page.getByTestId('initial-feeding').uncheck();
      await page.getByTestId('public-location-confirmed').check();
      const creation = writeResponse(page, '/api/v1/places');
      await page.getByTestId('save-place').click();
      const createdResponse = await creation;
      expect(createdResponse.status()).toBe(201);
      const { place } = await createdResponse.json();
      expect(place.comment).toBe('Public fictional meeting place.');
      await expect(page.getByRole('dialog')).toHaveCount(0);

      await page.getByTestId('record-feeding').click();
      await page.getByTestId('flock-medium').check();
      await page.getByTestId('food-grain_mix').check();
      await page.getByTestId('feeding-comment').fill(feedingComment);
      const feedingWrite = writeResponse(page, `/api/v1/places/${place.id}/feedings`);
      await page.getByTestId('save-feeding').click();
      expect((await feedingWrite).status()).toBe(201);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      const { feedings } = await (await page.request.get(`/api/v1/places/${place.id}/feedings`)).json();
      expect(feedings[0].authorDisplayName).toBe(member.displayName);
      expect(feedings[0].comment).toBe(feedingComment);
      expect(feedings[0]).not.toHaveProperty('authorId');
      await expect(page.getByTestId('activity-log')).toContainText(feedingComment);
      await expect(page.getByTestId('activity-log').locator('b')).toHaveCount(0);

      const care = await report(page, description);
      expect(care.state).toBe('open');
      expect(care.description).toBe(description);
      await logout(page);
      const anonymous = await (await page.request.get(`/api/v1/care-cases/${care.id}`)).json();
      expect(anonymous.case.description).toBe(description);
      expect(anonymous.case.reporterDisplayName).toBe(member.displayName);
      for (const field of ['exactLocation', 'reporterId', 'assignedHelperId']) expect(anonymous.case).not.toHaveProperty(field);
      expect((await page.request.get(`/api/v1/care-cases/${care.id}/private`)).status()).toBe(404);
      await page.getByTestId(`care-case-${care.id}`).click();
      await expect(page.getByTestId('case-public')).toContainText(description);
      await closeDialog(page);

      const carer = await login(page, 'member2');
      expect(carer.roles).toEqual(['member']);
      await page.getByTestId(`care-case-${care.id}`).click();
      const plannedDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + 86400000));
      await page.getByTestId('planned-date').fill(plannedDate);
      await page.getByTestId('action-comment').fill('I can visit tomorrow.');
      const claimWrite = writeResponse(page, `/api/v1/care-cases/${care.id}/claim`);
      await page.getByTestId('case-claim').click();
      const claimed = await (await claimWrite).json();
      expect(claimed.case.plannedDate).toBe(plannedDate);
      expect(claimed.case.assignedDisplayName).toBe(carer.displayName);
      await expect(page.getByTestId('case-release')).toBeVisible();
      await page.getByTestId('action-comment').fill('Public update: checked the area.');
      const commentWrite = writeResponse(page, `/api/v1/care-cases/${care.id}/comments`);
      await page.getByTestId('case-comment').click();
      const commented = await (await commentWrite).json();
      expect(commented.case.state).toBe('claimed');
      await page.getByTestId('action-comment').fill(handledComment);
      const resolveWrite = writeResponse(page, `/api/v1/care-cases/${care.id}/resolve`);
      await page.getByTestId('case-resolve').click();
      expect((await (await resolveWrite).json()).case.state).toBe('resolved');
      await closeDialog(page);
      const immediate = await report(page, 'Fictional bird assisted immediately.', true, immediateComment);
      expect(immediate.state).toBe('resolved');
      await logout(page);
      await page.reload();
      await page.getByTestId('search-places').fill(name);
      await page.getByTestId('toggle-list').click();
      await page.getByTestId(`place-${place.id}`).click();
      await expect(page.getByTestId('activity-log')).toContainText(handledComment);
      await expect(page.getByTestId('activity-log')).toContainText(immediateComment);
      const { activity } = await (await page.request.get(`/api/v1/places/${place.id}/activity`)).json();
      expect(activity.some((item: any) => item.kind === 'feeding' && item.authorDisplayName === member.displayName)).toBe(true);
      expect(activity.some((item: any) => item.care?.action === 'resolve' && item.authorDisplayName === carer.displayName && item.comment === handledComment)).toBe(true);
      expect(activity.filter((item: any) => item.care?.caseId === immediate.id)).toHaveLength(1);
      expect(activity.find((item: any) => item.care?.caseId === immediate.id).care.action).toBe('reported_resolved');
      await noHorizontalOverflow(page);
      await page.screenshot({ path: testInfo.outputPath(`community-care-${viewport.width}.png`), fullPage: true });
      await page.getByTestId('language-toggle').click();
      await noHorizontalOverflow(page);
    } finally { await cleanup(name); }
  });
}

for (const code of [1, 2, 3]) {
  test(`geolocation failure ${code} keeps manual place creation available`, async ({ page }) => {
    const name = `E2E GPS ${randomUUID()}`;
    await page.addInitScript(code => {
      Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition(_success: unknown, error: (value: unknown) => void) { error({ code, message: 'Simulated location failure' }); } } });
    }, code);
    try {
      await page.goto('/'); await login(page, 'member'); await page.getByTestId('add-place').click();
      await expect(page.getByTestId('geolocation-status')).toBeVisible();
      await page.getByTestId('place-name').fill(name);
      await page.getByTestId('latitude').fill('57.7085'); await page.getByTestId('longitude').fill('11.975');
      await page.getByTestId('public-location-confirmed').check();
      const creation = writeResponse(page, '/api/v1/places'); await page.getByTestId('save-place').click();
      expect((await creation).status()).toBe(201); await expect(page.getByRole('dialog')).toHaveCount(0);
    } finally { await cleanup(name); }
  });
}

test('late geolocation cannot overwrite manual edits, confirmed pins or a different form', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__geoRequests = [];
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition(success: unknown, error: unknown) { (window as any).__geoRequests.push({ success, error }); } } });
  });
  async function respond(index: number, latitude: number, longitude: number) {
    await page.evaluate(({ index, latitude, longitude }) => (window as any).__geoRequests[index].success({ coords: { latitude, longitude, accuracy: 12 }, timestamp: Date.now() }), { index, latitude, longitude });
  }
  await page.goto('/'); await login(page, 'member'); await page.getByTestId('add-place').click();
  await expect.poll(() => page.evaluate(() => (window as any).__geoRequests.length)).toBe(1);
  await page.getByTestId('latitude').fill('57.71'); await page.getByTestId('longitude').fill('11.94');
  await page.getByTestId('public-location-confirmed').check(); await respond(0, 57.72, 11.92);
  await expect(page.getByTestId('latitude')).toHaveValue('57.71'); await expect(page.getByTestId('public-location-confirmed')).toBeChecked();
  await page.getByTestId('longitude').fill('11.941'); await expect(page.getByTestId('public-location-confirmed')).not.toBeChecked();
  await page.getByTestId('use-my-location').click(); await respond(1, 57.70889, 11.91953);
  await expect(page.getByTestId('latitude')).toHaveValue('57.70889'); await expect(page.getByTestId('public-location-confirmed')).not.toBeChecked();
  await page.getByTestId('use-my-location').click(); await closeDialog(page); await page.getByTestId('add-place').click();
  await expect.poll(() => page.evaluate(() => (window as any).__geoRequests.length)).toBe(4);
  const initialLatitude = await page.getByTestId('latitude').inputValue(); await respond(2, 57.72, 11.92);
  await expect(page.getByTestId('latitude')).toHaveValue(initialLatitude); await respond(3, 57.70889, 11.91953);
  await expect(page.getByTestId('latitude')).toHaveValue('57.70889');
  await page.getByTestId('use-my-location').click(); await page.getByTestId('public-location-confirmed').check(); await respond(4, 57.72, 11.92);
  await expect(page.getByTestId('latitude')).toHaveValue('57.70889'); await expect(page.getByTestId('public-location-confirmed')).toBeChecked();
  await closeDialog(page);
});
