import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Core Sunday flow (§19.2): quick bar → preview → go live → verify the output window DOM,
 * then crash the control renderer and verify the output keeps showing the verse.
 */
let app: ElectronApplication;
let control: Page;
let dir: string;

test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'lampstand-e2e-'));
  // Seed one image into the library so media flows can be tested without a file dialog.
  const mediaDir = join(dir, 'library', 'media');
  mkdirSync(join(mediaDir, '.meta'), { recursive: true });
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  writeFileSync(join(mediaDir, 'seed-image.png'), png);
  const now = new Date().toISOString();
  // A 6-second test video (e2e/fixtures/clip.mp4) for the video transport.
  const clip = readFileSync(join(__dirname, 'fixtures', 'clip.mp4'));
  writeFileSync(join(mediaDir, 'seed-clip.mp4'), clip);
  writeFileSync(
    join(mediaDir, '.meta', 'seed-clip.media.json'),
    JSON.stringify({
      id: 'seed-clip',
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
      name: 'Seed clip',
      kind: 'video',
      fileName: 'seed-clip.mp4',
      mimeType: 'video/mp4',
      sizeBytes: clip.length,
      hasThumbnail: false,
      isBackground: false,
      tags: [],
    }),
  );
  writeFileSync(
    join(mediaDir, '.meta', 'seed-image.media.json'),
    JSON.stringify({
      id: 'seed-image',
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
      name: 'Seed image',
      kind: 'image',
      fileName: 'seed-image.png',
      mimeType: 'image/png',
      sizeBytes: png.length,
      hasThumbnail: false,
      isBackground: false,
      tags: [],
    }),
  );
  const env = {
    ...process.env,
    LAMPSTAND_USER_DATA: join(dir, 'user'),
    LAMPSTAND_LIBRARY: join(dir, 'library'),
    NODE_ENV: 'test',
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_RENDERER_URL;
  app = await electron.launch({ args: ['.'], cwd: join(__dirname, '..'), env });
  const mainOutput: string[] = [];
  app.process().stdout?.on('data', (d: Buffer) => mainOutput.push(d.toString()));
  app.process().stderr?.on('data', (d: Buffer) => mainOutput.push(d.toString()));
  control = await app.firstWindow();
  const pageErrors: string[] = [];
  control.on('pageerror', (e) => pageErrors.push(e.message));
  control.on('console', (m) => m.type() === 'error' && pageErrors.push(m.text()));
  try {
    await control.waitForSelector('text=Sample Sunday service', { timeout: 30_000 });
  } catch (e) {
    // Startup diagnostics: what windows exist, what the page shows, and what main logged.
    const windows = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().map((w) => ({
        title: w.getTitle(),
        url: w.webContents.getURL(),
        visible: w.isVisible(),
        crashed: w.webContents.isCrashed(),
      })),
    );
    const body = await control
      .evaluate(() => document.body.innerText.slice(0, 500))
      .catch((err: unknown) => `<unavailable: ${String(err)}>`);
    console.log(
      'STARTUP FAILURE\nwindows:',
      JSON.stringify(windows),
      '\npage url:',
      control.url(),
      '\nbody:',
      body,
      '\npage errors:',
      JSON.stringify(pageErrors),
      '\nmain output:\n',
      mainOutput.join('').slice(-4000),
    );
    throw e;
  }
});

test.afterAll(async () => {
  await app.close().catch(() => undefined);
  rmSync(dir, { recursive: true, force: true });
});

const outputPage = async (): Promise<Page> => {
  for (let i = 0; i < 50; i++) {
    const p = app.windows().find((w) => w.url().includes('/output/') && !w.isClosed());
    if (p) return p;
    await new Promise((r) => setTimeout(r, 200));
  }
  const titles = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((w) => w.webContents.getURL()),
  );
  throw new Error(
    `output window did not open; windows: ${JSON.stringify(titles)} pages: ${JSON.stringify(app.windows().map((w) => w.url()))}`,
  );
};

test('control window renders with the sample service', async () => {
  await expect(control.getByText('Sample Sunday service').first()).toBeVisible();
  await control.screenshot({ path: 'test-results/01-control.png' });
  // Fresh install: no screen assigned, so the top bar must warn instead of failing silently.
  await expect(control.getByRole('button', { name: /No output/ })).toBeVisible();
});

test('quick bar: jn 3 16 → preview → go live → output shows the verse', async () => {
  // Rehearsal/window mode so the test never takes over a real projector.
  await control.evaluate(() =>
    window.lampstand.command({ type: 'settings.update', payload: { patch: { windowMode: true } } }),
  );
  const out = await outputPage();
  await control.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K');
  await control.keyboard.type('jn 3 16');
  await expect(control.getByRole('option').first()).toContainText('John 3:16');
  await control.screenshot({ path: 'test-results/02a-quickbar.png' });
  await control.keyboard.press('Enter');
  await expect
    .poll(async () => (await control.evaluate(() => window.lampstand.query('live.get'))).ok)
    .toBe(true);
  await control.waitForTimeout(500);
  await control.screenshot({ path: 'test-results/02-preview.png' });
  await control.keyboard.press('Space');
  await expect(out.locator('.ls-text')).toContainText('For God so loved the world', {
    timeout: 10_000,
  });
  await out.waitForTimeout(1000); // let the fade-in finish
  await out.screenshot({ path: 'test-results/03-output.png' });
  await control.waitForTimeout(600);
  await control.screenshot({ path: 'test-results/04-live.png' });
  await control.getByRole('button', { name: 'Bible', exact: true }).click(); // collapse the drawer
  await control.getByText('John 3:16–17').first().click();
  await control.waitForTimeout(800);
  await control.screenshot({ path: 'test-results/04b-drawer-closed.png' });
  await control.getByRole('button', { name: 'Bible', exact: true }).click();
});

test('create a song in the editor → add to service → go live → output shows the lyric', async () => {
  await control.getByRole('button', { name: 'Songs', exact: true }).click();
  await control.getByRole('button', { name: 'New song' }).click();
  await control.getByLabel('Title').fill('Test Song');
  await control
    .getByLabel('Lyrics')
    .fill('[Verse 1]\nHallelujah test line\n\n[Chorus]\nChorus test line');
  await control.screenshot({ path: 'test-results/05-song-editor.png' });
  await control.getByRole('button', { name: 'Save song' }).click();
  const row = control.getByRole('button', { name: /Test Song/ });
  await row.dblclick(); // double-click adds to service
  await expect(control.locator('ol').getByText('Test Song').first()).toBeVisible();
  await control
    .getByRole('button', { name: /Verse 1/ })
    .first()
    .dblclick(); // double-click a slide = show now
  const out = await outputPage();
  await expect(out.locator('.ls-text').last()).toContainText('Hallelujah test line', {
    timeout: 10_000,
  });
  await control.keyboard.press('ArrowRight');
  await expect(out.locator('.ls-text').last()).toContainText('Chorus test line', {
    timeout: 10_000,
  });
});

test('settings: category pages, installed Bible packages', async () => {
  await control.getByTitle('Settings').click();
  const nav = control.getByRole('navigation', { name: 'Settings' });
  await expect(control.getByRole('heading', { name: 'General' })).toBeVisible();
  await control.waitForTimeout(200);
  await control.screenshot({ path: 'test-results/06-settings-general.png' });
  await nav.getByRole('button', { name: 'Bibles & hymnals' }).click();
  await expect(control.getByText('King James Version')).toBeVisible();
  await control.screenshot({ path: 'test-results/06-settings-packages.png' });
  for (const page of ['Scripture', 'Presenting', 'Library & backups']) {
    await nav.getByRole('button', { name: page }).click();
    await expect(control.getByRole('heading', { name: page })).toBeVisible();
    await control.screenshot({
      path: `test-results/06-settings-${page.split(' ')[0]?.toLowerCase() ?? page}.png`,
    });
  }
  // Toggle a live-editing switch on and off again: it must persist without touching other settings.
  await nav.getByRole('button', { name: 'Presenting' }).click();
  const songSwitch = control.getByRole('switch', { name: 'Song' });
  await songSwitch.click();
  await expect(songSwitch).toHaveAttribute('aria-checked', 'true');
  await songSwitch.click();
  await expect(songSwitch).toHaveAttribute('aria-checked', 'false');
  // Guide: steps reflect real state, and its buttons navigate.
  await nav.getByRole('button', { name: 'Guide' }).click();
  await expect(control.getByRole('heading', { name: 'Guide' })).toBeVisible();
  await expect(control.locator('[data-step="screens"]')).toHaveAttribute('data-done', 'true'); // window mode is on
  await expect(control.locator('[data-step="live"]')).toHaveAttribute('data-done', 'true');
  await expect(control.locator('[data-step="packages"]')).not.toHaveAttribute('data-done', /.*/); // not checkable
  await control.waitForTimeout(150);
  await control.screenshot({ path: 'test-results/06-settings-guide.png' });
  await control.getByRole('button', { name: 'Bibles & hymnals' }).last().click();
  await expect(control.getByRole('heading', { name: 'Bibles & hymnals' })).toBeVisible();
  await nav.getByRole('button', { name: 'General' }).click();
  await control.keyboard.press('Escape');
});

test('styled dropdowns open, pick, and work with the keyboard', async () => {
  // Bible version dropdown (library drawer).
  const bible = control.getByRole('button', { name: 'Bible', exact: true });
  if ((await bible.getAttribute('aria-pressed')) !== 'true') await bible.click();
  await control.getByRole('combobox', { name: 'Version' }).click();
  await expect(control.getByRole('option', { name: /KJV/ })).toBeVisible();
  await control.waitForTimeout(300);
  await control.screenshot({ path: 'test-results/07-dropdown-version.png' });
  await control.keyboard.press('Escape');
  // Output role dropdown inside a dialog.
  await control.getByTitle('Outputs').first().click();
  const role = control.getByRole('combobox').first();
  await role.click();
  await expect(control.getByRole('option', { name: /Stage display/ })).toBeVisible();
  await control.waitForTimeout(300);
  await control.screenshot({ path: 'test-results/08-dropdown-role.png' });
  await control.keyboard.press('Escape');
  await control.keyboard.press('Escape');
  // Theme editor: font + background dropdowns with previews.
  await control.getByRole('button', { name: 'Themes', exact: true }).click();
  await control.getByRole('button', { name: 'Duplicate' }).first().click();
  await control.getByRole('combobox').nth(1).click();
  await control.waitForTimeout(300);
  await control.screenshot({ path: 'test-results/09-dropdown-background.png' });
  await control.keyboard.press('ArrowDown');
  await control.keyboard.press('Enter');
  await control.getByRole('combobox').first().click();
  await control.waitForTimeout(300);
  await control.screenshot({ path: 'test-results/10-dropdown-font.png' });
  await control.keyboard.press('Escape');
  await control.keyboard.press('Escape');
  await control.getByRole('button', { name: 'Bible', exact: true }).click();
});

test('text slides: inspector edits the selected slide, add-slide card appends', async () => {
  await control.getByRole('button', { name: 'Slides', exact: true }).click(); // "+ Slides" in the service plan
  await control.getByText('Text slides').last().click();
  await expect(control.getByText('Slide 1 of 1')).toBeVisible();
  await control.getByRole('button', { name: 'Add slide' }).click();
  await expect(control.getByText('Slide 2 of 2')).toBeVisible();
  await control.getByLabel('Heading', { exact: true }).fill('Welcome');
  await control.getByLabel('Text', { exact: true }).fill('Coffee is served after the service');
  await expect(control.getByRole('button', { name: /Welcome/ }).first()).toBeVisible();
  await control.waitForTimeout(400);
  await control.screenshot({ path: 'test-results/11-inspector.png' });
});

test('hovering service plan rows never shifts the layout', async () => {
  const plan = control.getByRole('region', { name: 'Service plan' });
  const boxes = () =>
    plan.locator('ol > li').evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return [Math.round(r.top), Math.round(r.height)];
      }),
    );
  const before = await boxes();
  await plan.getByText('Word', { exact: true }).hover();
  await control.waitForTimeout(250);
  expect(await boxes()).toEqual(before);
  await plan.getByText('John 3:16–17').hover();
  await control.waitForTimeout(250);
  expect(await boxes()).toEqual(before);
  await control.screenshot({ path: 'test-results/12-plan-hover.png' });
});

test('dragging a section moves the whole block and never splits another section', async () => {
  const plan = control.getByRole('region', { name: 'Service plan' });
  const order = () =>
    plan.locator('ol > li').evaluateAll((els) =>
      els
        .map((e) =>
          e.textContent
            .trim()
            .split(/\s{2,}|KJV|Countdown|Announcements/)[0]
            ?.trim(),
        )
        .filter(Boolean),
    );
  const before = await order();
  // Drop the "Worship" heading onto John 3:16–17, which sits in the middle of the Word section.
  await plan.getByText('Worship', { exact: true }).dragTo(plan.getByText('John 3:16–17'));
  await control.waitForTimeout(300);
  const after = await order();
  const word = after.indexOf('Word');
  const worship = after.indexOf('Worship');
  // Word's items stay together, and Worship lands after the whole Word section.
  expect(after.slice(word, word + 4)).toEqual([
    'Word',
    'Psalm 23:1–6',
    'John 3:16–17',
    'Romans 8:28–39',
  ]);
  expect(worship).toBe(word + 4);
  expect(after.length).toBe(before.length);
  await control.screenshot({ path: 'test-results/13-section-drag.png' });
});

test('drag from the library into the service plan (songs and verses)', async () => {
  const plan = control.getByRole('region', { name: 'Service plan' });
  const titles = () =>
    plan.locator('ol > li').evaluateAll((els) => els.map((e) => e.textContent.trim()));
  // Song: drop onto "Psalm 23:1–6" → inserted just before it.
  const songs = control.getByRole('button', { name: 'Songs', exact: true });
  if ((await songs.getAttribute('aria-pressed')) !== 'true') await songs.click();
  await control
    .getByRole('button', { name: /Test Song/ })
    .first()
    .dragTo(plan.getByText('Psalm 23:1–6'));
  await control.waitForTimeout(250);
  const afterSong = await titles();
  const psalm = afterSong.findIndex((x) => x.startsWith('Psalm 23:1–6'));
  expect(afterSong[psalm - 1]).toMatch(/^Test Song/);
  // Verse: Bible → Genesis 1, drag verse 1 to the end of the plan.
  await control.getByRole('button', { name: 'Bible', exact: true }).click();
  await control.getByRole('button', { name: 'Genesis' }).click();
  const before = (await titles()).length;
  await control
    .getByRole('button', { name: /In the beginning God created/ })
    .dragTo(plan.locator('ol'), { targetPosition: { x: 40, y: 5 } });
  await control.waitForTimeout(250);
  const afterVerse = await titles();
  expect(afterVerse.length).toBe(before + 1);
  expect(afterVerse.some((x) => x.startsWith('Genesis 1:1'))).toBe(true);
  await control.screenshot({ path: 'test-results/14-library-drag.png' });
});

test('undo / redo: buttons and ⌘Z revert and re-apply service edits', async () => {
  const plan = control.getByRole('region', { name: 'Service plan' });
  const rows = () => plan.locator('ol > li').count();
  const undo = control.getByRole('button', { name: /^Undo/ });
  const redo = control.getByRole('button', { name: /^Redo/ });
  const before = await rows();
  await plan.getByRole('button', { name: 'Section', exact: true }).click();
  await expect.poll(rows).toBe(before + 1);
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect.poll(rows).toBe(before);
  await expect(redo).toBeEnabled();
  await redo.click();
  await expect.poll(rows).toBe(before + 1);
  await expect(redo).toBeDisabled();
  await control.locator('body').click({ position: { x: 5, y: 5 } }); // make sure no text field has focus
  await control.keyboard.press(process.platform === 'darwin' ? 'Meta+Z' : 'Control+Z');
  await expect.poll(rows).toBe(before); // leaves the plan as it was for later tests
});

test('media: click previews it, Space shows it full-screen without leftover text', async () => {
  const mediaTab = control.getByRole('button', { name: 'Media', exact: true });
  if ((await mediaTab.getAttribute('aria-pressed')) !== 'true') await mediaTab.click();
  await control
    .locator('aside')
    .getByText('Seed image')
    .locator('..')
    .locator('..')
    .locator('button')
    .first()
    .click();
  // Preview monitor now holds the image (and nothing went to the screen yet).
  const previewMonitor = control.locator('figure').filter({ hasText: 'Preview' });
  await expect(previewMonitor.locator('.ls-layer-media img')).toHaveCount(1);
  const out = await outputPage();
  await expect(out.locator('.ls-layer-media img')).toHaveCount(0);
  await control.locator('body').click({ position: { x: 5, y: 5 } });
  await control.keyboard.press('Space');
  await expect(out.locator('.ls-layer-media img')).toHaveCount(1);
  await expect(out.locator('.ls-layer-content .ls-text')).toHaveCount(0, { timeout: 3000 }); // old verse cleared

  // Reverse: with the media live, preview a verse (single click) and take it live with Space.
  const bible = control.getByRole('button', { name: 'Bible', exact: true });
  if ((await bible.getAttribute('aria-pressed')) !== 'true') await bible.click();
  const back = control
    .getByRole('button', { name: /^Genesis$/ })
    .or(control.getByRole('button', { name: 'Genesis' }));
  if (await back.count()) await back.first().click();
  await control.getByRole('button', { name: /In the beginning God created/ }).click();
  await expect(previewMonitor.locator('.ls-text')).toContainText('In the beginning');
  await expect(out.locator('.ls-layer-media img')).toHaveCount(1); // still the media on screen
  await control.locator('body').click({ position: { x: 5, y: 5 } });
  await control.keyboard.press('Space');
  await expect(out.locator('.ls-text').last()).toContainText('In the beginning');
  await expect(out.locator('.ls-layer-media img')).toHaveCount(0, { timeout: 3000 }); // verse replaced the media
});

test('media protocol serves byte ranges, so long videos can seek', async () => {
  const r = await app.evaluate(async ({ net }) => {
    const res = await net.fetch('lampstand-media://media/seed-clip', {
      headers: { Range: 'bytes=100-199' },
    });
    return {
      status: res.status,
      length: (await res.arrayBuffer()).byteLength,
      range: res.headers.get('content-range'),
    };
  });
  expect(r.status).toBe(206);
  expect(r.length).toBe(100);
  expect(r.range).toMatch(/^bytes 100-199\/\d+$/);
});

test('video transport controls every output; Turn off live clears the screen', async () => {
  const mediaTab = control.getByRole('button', { name: 'Media', exact: true });
  if ((await mediaTab.getAttribute('aria-pressed')) !== 'true') await mediaTab.click();
  await control
    .locator('aside')
    .getByText('Seed clip')
    .locator('..')
    .locator('..')
    .locator('button')
    .first()
    .click();
  await control.locator('body').click({ position: { x: 5, y: 5 } });
  await control.keyboard.press('Space'); // preview → live
  let out = await outputPage();
  let outVideo = out.locator('.ls-layer-media video');
  await expect(outVideo).toHaveCount(1);
  const transport = control.getByRole('group', { name: 'Video controls' });
  await expect(transport).toBeVisible();
  const position = transport.getByRole('slider', { name: 'Position' });
  // Sound comes from exactly one place: the Output window here, so the Program monitor is
  // silent; with no output at all, the monitor plays it instead of nobody.
  const monitorVideo = control.locator('figure').filter({ hasText: 'Program' }).locator('video');
  await expect.poll(() => outVideo.evaluate((v: HTMLVideoElement) => v.muted)).toBe(false);
  await expect.poll(() => monitorVideo.evaluate((v: HTMLVideoElement) => v.muted)).toBe(true);
  const setWindowMode = (on: boolean) =>
    control.evaluate(
      (windowMode) =>
        window.lampstand.command({ type: 'settings.update', payload: { patch: { windowMode } } }),
      on,
    );
  await setWindowMode(false);
  await expect.poll(() => monitorVideo.evaluate((v: HTMLVideoElement) => v.muted)).toBe(false);
  await setWindowMode(true);
  await expect.poll(() => monitorVideo.evaluate((v: HTMLVideoElement) => v.muted)).toBe(true);
  await expect
    .poll(() => app.windows().filter((w) => w.url().includes('/output/') && !w.isClosed()).length)
    .toBe(1);
  out = await outputPage();
  outVideo = out.locator('.ls-layer-media video');
  await expect(outVideo).toHaveCount(1);
  await expect.poll(() => outVideo.evaluate((v: HTMLVideoElement) => v.muted)).toBe(false);
  // Playing: time advances on the output.
  await expect
    .poll(() => outVideo.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 5000 })
    .toBeGreaterThan(0.5);
  // Pause from the transport → the output pauses.
  await transport.getByRole('button', { name: 'Pause' }).click();
  await expect.poll(() => outVideo.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  const pausedAt = await outVideo.evaluate((v: HTMLVideoElement) => v.currentTime);
  await control.waitForTimeout(600);
  expect(await outVideo.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeCloseTo(pausedAt, 1);
  // Restart while playing → the operator's bar and clock jump straight back to the start.
  await transport.getByRole('button', { name: 'Play' }).click();
  await expect.poll(async () => Number(await position.inputValue())).toBeGreaterThan(1);
  await transport.getByRole('button', { name: 'Restart from the beginning' }).click();
  await expect.poll(async () => Number(await position.inputValue())).toBeLessThan(0.5);
  await transport.getByRole('button', { name: 'Pause' }).click();
  // Scrub, releasing the mouse off the slider (as happens when a drag overshoots).
  const mediaCommands = async (): Promise<number> => {
    const r = await control.evaluate(() => window.lampstand.query('audit.recent'));
    return r.ok ? r.value.filter((e: { type: string }) => e.type === 'live.media').length : 0;
  };
  const box = (await position.boundingBox())!;
  const drag = async (fromX: number, toX: number, releaseOff: boolean): Promise<void> => {
    await control.mouse.move(box.x + fromX, box.y + box.height / 2);
    await control.mouse.down();
    await control.mouse.move(box.x + toX, box.y + box.height / 2, { steps: 8 });
    if (releaseOff) await control.mouse.move(box.x + toX, box.y - 120, { steps: 5 });
    await control.mouse.up();
  };
  let before = await mediaCommands();
  await drag(4, box.width * 0.8, true);
  // Exactly one seek per drag: a second, stale commit would snap the video straight back.
  await expect.poll(mediaCommands).toBe(before + 1);
  await control.waitForTimeout(600);
  expect(await mediaCommands()).toBe(before + 1);
  expect(Number(await position.inputValue())).toBeGreaterThan(3);
  expect(await outVideo.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(3);
  // While playing, too: drag from the thumb back towards the start and it sticks.
  await transport.getByRole('button', { name: 'Play' }).click();
  before = await mediaCommands();
  const thumbX = (Number(await position.inputValue()) / 6) * box.width;
  await drag(thumbX, box.width * 0.25, false);
  await expect.poll(mediaCommands).toBe(before + 1);
  await control.waitForTimeout(600);
  expect(await mediaCommands()).toBe(before + 1);
  const t = await outVideo.evaluate((v: HTMLVideoElement) => v.currentTime);
  expect(t).toBeGreaterThan(1);
  expect(t).toBeLessThan(3.5);
  await transport.getByRole('button', { name: 'Pause' }).click();
  // Restart → back to the start and playing again; the P shortcut toggles too.
  await transport.getByRole('button', { name: 'Restart from the beginning' }).click();
  await expect
    .poll(() => outVideo.evaluate((v: HTMLVideoElement) => !v.paused && v.currentTime < 1.5))
    .toBe(true);
  // The operator's progress bar jumps back to the start too.
  await expect.poll(async () => Number(await position.inputValue())).toBeLessThan(1.5);
  await control.locator('body').click({ position: { x: 5, y: 5 } });
  await control.keyboard.press('p');
  await expect.poll(() => outVideo.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  await control.waitForTimeout(300);
  await control.screenshot({ path: 'test-results/15-video-transport.png' });
  // "Turn off live" (top bar, next to the LIVE indicator) takes it all off the screen.
  const turnOff = control.getByRole('button', { name: /Turn off live/ });
  await expect(turnOff).toBeVisible();
  await turnOff.click();
  await expect(outVideo).toHaveCount(0);
  await expect(out.locator('.ls-text')).toHaveCount(0);
  await expect(out.locator('.ls-bg')).toHaveCount(0); // background off too
  await expect(turnOff).toBeHidden(); // nothing on screen → the button goes away
  await expect(control.getByRole('status').filter({ hasText: /Off air/i })).toBeVisible();
  // Instead of an empty screen, the projector shows the off-air logo card…
  const standby = out.locator('.ls-layer-standby');
  await expect(standby.locator('.ls-standby-logo')).toHaveText('Lampstand');
  await expect.poll(() => standby.evaluate((n) => (n as HTMLElement).style.opacity)).toBe('1');
  // …or an image from the library, picked in Settings → Presenting.
  await control.getByRole('button', { name: 'Settings', exact: true }).click();
  await control
    .getByRole('navigation', { name: 'Settings' })
    .getByRole('button', { name: 'Presenting' })
    .click();
  const offAir = control.getByRole('radiogroup', { name: 'When nothing is live, show' });
  await offAir.getByRole('radio', { name: 'Image or video' }).click();
  await control.getByRole('combobox', { name: 'Off-air picture' }).click();
  await control.getByRole('option', { name: /Seed image/ }).click();
  await expect(standby.locator('.ls-standby-image img')).toHaveCount(1);
  await expect(control.getByTestId('off-air-preview').locator('.ls-standby-image')).toHaveCount(1);
  await control.waitForTimeout(300);
  await control.screenshot({ path: 'test-results/16-off-air-settings.png' });
  await out.screenshot({ path: 'test-results/16-off-air-output.png' });
  await offAir.getByRole('radio', { name: 'Logo' }).click(); // back to the default
  await expect(standby.locator('.ls-standby-logo')).toHaveCount(1);
  // The logo itself: a church name, or an image/video, used by Logo (L) and the off-air "Logo".
  const name = control.getByLabel('Church name');
  await name.fill('Grace Church');
  await name.blur();
  await expect(standby.locator('.ls-standby-logo')).toHaveText('Grace Church');
  const logoKind = control.getByRole('radiogroup', { name: 'Logo shows' });
  await logoKind.getByRole('radio', { name: 'Image or video' }).click();
  await control.getByRole('combobox', { name: 'Logo picture' }).click();
  await control.getByRole('option', { name: /Seed clip/ }).click();
  await expect(standby.locator('.ls-standby-video video')).toHaveCount(1); // off-air follows the logo
  await expect(out.locator('.ls-mask-logo .ls-logo-video video')).toHaveCount(1); // and so does L
  await expect(control.getByTestId('logo-preview').locator('.ls-logo-video')).toHaveCount(1);
  await control.waitForTimeout(300);
  await control.screenshot({ path: 'test-results/17-logo-settings.png' });
  await logoKind.getByRole('radio', { name: 'Name' }).click();
  await name.fill('Lampstand');
  await name.blur();
  await expect(standby.locator('.ls-standby-logo')).toHaveText('Lampstand');
  await control
    .getByRole('navigation', { name: 'Settings' })
    .getByRole('button', { name: 'General' })
    .click();
  await control.keyboard.press('Escape');
});

test('smoothness: slider drag commits once; output transitions do not accumulate', async () => {
  // Interface-size slider: dragging stays local and commits a single update on release.
  await control.getByRole('button', { name: 'Settings', exact: true }).click();
  const slider = control.locator('#ui-scale');
  const box = await slider.boundingBox();
  if (!box) throw new Error('slider not visible');
  const readAudit = async () => {
    const r = await control.evaluate(() => window.lampstand.query('audit.recent'));
    return r.ok ? r.value : [];
  };
  const auditBefore = (await readAudit()).length;
  await control.mouse.move(box.x + 4, box.y + box.height / 2);
  await control.mouse.down();
  for (let x = 4; x <= box.width * 0.6; x += 6)
    await control.mouse.move(box.x + x, box.y + box.height / 2);
  await control.mouse.up();
  await control.waitForTimeout(300);
  const audit = await readAudit();
  const updates = audit.slice(auditBefore).filter((e) => e.type === 'settings.update');
  expect(updates).toHaveLength(1);
  // Put the size back so later screenshots are comparable.
  await control.evaluate(() =>
    window.lampstand.command({ type: 'settings.update', payload: { patch: { uiScale: 1 } } }),
  );
  await control.keyboard.press('Escape');

  // Output window: after many go-lives, finished transitions are released (only infinite loops remain).
  const out = await outputPage();
  for (let n = 0; n < 8; n++) {
    await control.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K');
    await control.keyboard.type(n % 2 ? 'jn 3 16' : 'ps 23 1');
    await expect(control.getByRole('option').first()).toBeVisible();
    await control.keyboard.press('Shift+Enter');
    await control.waitForTimeout(550);
  }
  await out.waitForTimeout(600);
  const finite = await out.evaluate(
    () =>
      document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).length,
  );
  expect(finite).toBe(0);
});

test('Escape (panic) clears text but keeps the background', async () => {
  await control.keyboard.press('Escape');
  const out = await outputPage();
  await expect(out.locator('.ls-text')).toHaveCount(0, { timeout: 5000 });
  await expect(out.locator('.ls-bg')).toHaveCount(1);
  // Put the verse back for the crash test: quick bar, Shift+Enter = show now.
  await control.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K');
  await control.keyboard.type('jn 3 16');
  await expect(control.getByRole('option').first()).toContainText('John 3:16');
  await control.keyboard.press('Shift+Enter');
  await expect(out.locator('.ls-text')).toContainText('For God so loved the world', {
    timeout: 10_000,
  });
});

test('output survives a control renderer crash', async () => {
  const out = await outputPage();
  await app.evaluate(({ BrowserWindow }) => {
    const ctl = BrowserWindow.getAllWindows().find((w) => w.getTitle() === 'Lampstand');
    ctl?.webContents.forcefullyCrashRenderer();
  });
  await new Promise((r) => setTimeout(r, 1500));
  await expect(out.locator('.ls-text')).toContainText('For God so loved the world');
  // The control window is reloaded automatically.
  await expect
    .poll(
      () =>
        app.evaluate(
          ({ BrowserWindow }) =>
            BrowserWindow.getAllWindows()
              .find((w) => w.getTitle() === 'Lampstand')
              ?.webContents.isCrashed() ?? true,
        ),
      { timeout: 10_000 },
    )
    .toBe(false);
});
