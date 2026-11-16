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
import { strToU8, zipSync } from 'fflate';

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

/** Switch the workspace: Show/Edit/Reflow/Bible in the toolbar, Themes = Theme, Stage under More. */
const mode = async (name: 'Show' | 'Edit' | 'Reflow' | 'Bible' | 'Themes' | 'Stage') => {
  const nav = control.getByRole('navigation', { name: 'Workspace' });
  if (name === 'Themes') {
    await control.getByRole('banner').getByRole('button', { name: 'Theme', exact: true }).click();
    return;
  }
  if (name === 'Stage') {
    await nav.getByRole('button', { name: 'More' }).click();
    await control.getByRole('menuitem', { name }).click();
    return;
  }
  const tab = nav.getByRole('button', { name, exact: true });
  if ((await tab.getAttribute('aria-pressed')) !== 'true') await tab.click();
};
/**
 * Open a bin: Media and Backgrounds are in the media bin under the slides (opened from the
 * toolbar); Props, Messages and Timers are show-control tabs under the output monitor.
 */
const binTab = async (name: string) => {
  if (name === 'Media' || name === 'Backgrounds') {
    const bin = control.getByRole('region', { name: 'Bin' });
    if ((await bin.count()) === 0)
      await control.getByRole('banner').getByRole('button', { name: 'Media', exact: true }).click();
    const cat = bin.getByRole('button', { name, exact: true });
    if ((await cat.getAttribute('aria-pressed')) !== 'true') await cat.click();
    return;
  }
  const tab = control
    .getByRole('region', { name: 'Show controls' })
    .getByRole('tab', { name, exact: true });
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
};
/** "Preview first": clicks load Preview and Space sends it, instead of clicks going live. */
const previewFirst = async (on: boolean) => {
  const sw = control.getByRole('switch', { name: 'Preview first' });
  if ((await sw.getAttribute('aria-checked')) !== String(on)) await sw.click();
};

/**
 * The open playlist's items in the sidebar. The sidebar lists either a library's songs or the
 * playlist, so pick the playlist in the outline first when a library is showing.
 */
const servicePlan = async () => {
  const plan = control.getByRole('region', { name: 'Service plan' });
  if ((await plan.count()) === 0)
    await control
      .getByRole('region', { name: 'Library' })
      .getByRole('button', { name: 'Sample Sunday service' })
      .click();
  return plan;
};

/** Add something to the service plan from its "+ Add" menu. */
const addToPlan = async (name: string) => {
  await (await servicePlan()).getByRole('button', { name: 'Add', exact: true }).click();
  await control.getByRole('menuitem', { name, exact: true }).click();
};

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
  await previewFirst(true);
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
  await previewFirst(false);
});

test('create a song in the editor → add to service → go live → output shows the lyric', async () => {
  await control
    .getByRole('region', { name: 'Library' })
    .getByRole('button', { name: 'Songs', exact: true })
    .click();
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

test('songs: build arrangements and a translation, then pick them per item', async () => {
  const out = await outputPage();
  await mode('Edit'); // Test Song (just added to the service) opens in the inline editor
  // Chords go in brackets inside lines; only the stage display shows them.
  await control
    .getByLabel('Lyrics', { exact: true })
    .fill('[Verse 1]\n[G]Hallelujah test line\n\n[Chorus]\n[C]Chorus test line');
  await control.getByRole('button', { name: '+ Add arrangement' }).click();
  await control.getByLabel('Arrangement name').last().fill('Short');
  await control.getByLabel('Order for Short').fill('C V1');
  await control.getByLabel('Language', { exact: true }).fill('es');
  await control
    .getByLabel('Translated words')
    .fill('[Verse 1]\nLinea de prueba\n\n[Chorus]\nCoro de prueba');
  await control.getByRole('button', { name: 'Save song' }).click();
  await mode('Show');
  const slides = control.getByRole('list', { name: 'Slide list' });
  await control.getByRole('combobox', { name: 'Arrangement' }).click();
  await control.getByRole('option', { name: 'Short' }).click();
  await expect(slides.locator('li').first()).toContainText('Chorus'); // the order changed
  await control.getByRole('combobox', { name: 'Translation' }).click();
  await control.getByRole('option', { name: 'ES' }).click();
  await slides
    .getByRole('button', { name: /^Chorus/ })
    .first()
    .click(); // click goes live
  await expect(out.locator('.ls-block-secondary')).toHaveText('Coro de prueba');
  await expect(out.locator('.ls-text').last()).not.toContainText('['); // the room never sees chords
  const stage = app.windows().find((w) => w.url().includes('/stage/'))!;
  await expect(stage.locator('#chords .chord-row')).toHaveText('C');
  await expect(stage.locator('#chords .lyric-row')).toHaveText('Chorus test line');
  // Transpose up a tone: the band's chart follows, the room's text doesn't change.
  const up = control.getByRole('button', { name: 'Transpose up a semitone' });
  await up.click();
  await up.click();
  await expect(control.getByTestId('transpose-value')).toHaveText('+2');
  await expect(stage.locator('#chords .chord-row')).toHaveText('D');
  await stage.screenshot({ path: 'test-results/05c-stage-chords.png' });
  const down = control.getByRole('button', { name: 'Transpose down a semitone' });
  await down.click();
  await down.click();
  await control.waitForTimeout(300);
  await control.screenshot({ path: 'test-results/05b-arrangement-translation.png' });
  // Back to the default arrangement, no translation, for the tests that follow.
  await control.getByRole('combobox', { name: 'Translation' }).click();
  await control.getByRole('option', { name: 'No translation' }).click();
  await control.getByRole('combobox', { name: 'Arrangement' }).click();
  await control.getByRole('option').first().click();
  await expect(slides.locator('li').first()).toContainText('Verse 1');
});

test('theme effects: a glow set in the theme editor reaches the output', async () => {
  const out = await outputPage();
  await mode('Themes');
  await control
    .getByRole('region', { name: 'Themes' })
    .getByRole('button', { name: 'Duplicate' })
    .first()
    .click();
  const editor = control.getByRole('dialog');
  await editor.getByLabel('Name', { exact: true }).fill('Glow test');
  await editor.getByRole('checkbox', { name: 'Glow' }).check();
  await editor.getByLabel('Brightness').fill('0.8');
  await control.waitForTimeout(200);
  await control.screenshot({ path: 'test-results/05d-theme-effects.png' });
  await editor.getByRole('button', { name: 'Save theme' }).click();
  // Make it the lyrics theme, then show a song slide.
  await control
    .getByRole('region', { name: 'Themes' })
    .locator('div.overflow-hidden')
    .filter({ hasText: 'Glow test' })
    .getByRole('button', { name: 'Lyrics' })
    .click();
  await mode('Show');
  await (await servicePlan()).getByText('Test Song').first().click();
  await control.getByRole('list', { name: 'Slide list' }).getByRole('button').first().click();
  await expect
    .poll(() =>
      out
        .locator('.ls-text')
        .last()
        .evaluate((e) => (e as HTMLElement).style.textShadow),
    )
    .toContain('24px');
});

test('text bar: formatting the selected song reaches the output; Use theme removes it', async () => {
  const out = await outputPage();
  await (await servicePlan()).getByText('Test Song').first().click();
  await control.getByRole('banner').getByRole('button', { name: 'Text formatting' }).click();
  const bar = control.getByRole('region', { name: 'Text formatting' });
  await bar.getByRole('button', { name: 'Align left' }).click();
  await bar.getByRole('button', { name: 'Italic' }).click();
  await bar.getByLabel('Size').fill('50');
  await bar.getByLabel('Size').press('Enter');
  await expect(bar.getByRole('button', { name: 'Align left' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await control.getByRole('list', { name: 'Slide list' }).getByRole('button').first().click();
  const style = () =>
    out
      .locator('.ls-text')
      .last()
      .evaluate((e) => {
        const s = (e as HTMLElement).style;
        return `${s.textAlign} ${s.fontStyle}`;
      });
  await expect.poll(style).toBe('left italic');
  await control.screenshot({ path: 'test-results/05e-text-bar.png' });
  // Use theme removes the item's formatting.
  await bar.getByRole('button', { name: 'Use theme' }).click();
  await expect(bar.getByRole('button', { name: 'Use theme' })).toBeDisabled();
  await control.getByRole('list', { name: 'Slide list' }).getByRole('button').first().click();
  await expect.poll(style).not.toBe('left italic');
  await bar.getByRole('button', { name: 'Close text bar' }).click();
  await expect(bar).toBeHidden();
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
  // The tour, the how-to recipes and the full feature list are all there; the list filters.
  await expect(control.locator('[data-tour]')).toHaveCount(6);
  await control.locator('[data-howto="verse"] summary').click();
  await expect(control.locator('[data-howto="verse"]')).toContainText('jn 3 16');
  const index = control.getByTestId('feature-index');
  await expect(index.locator('[data-feature="reflow"]')).toBeVisible();
  await index.getByLabel('Find a feature').fill('chord');
  await expect(index.locator('[data-feature="chords"]')).toBeVisible();
  await expect(index.locator('[data-feature="reflow"]')).toHaveCount(0);
  await index.getByLabel('Find a feature').fill('');
  await control.waitForTimeout(150);
  await control.screenshot({ path: 'test-results/06-settings-guide.png' });
  await control.getByRole('button', { name: 'Bibles & hymnals' }).last().click();
  await expect(control.getByRole('heading', { name: 'Bibles & hymnals' })).toBeVisible();
  await nav.getByRole('button', { name: 'General' }).click();
  await control.keyboard.press('Escape');
});

test('styled dropdowns open, pick, and work with the keyboard', async () => {
  // Bible version dropdown (library drawer).
  await mode('Bible');
  await control.getByRole('combobox', { name: 'Version' }).click();
  await expect(control.getByRole('option', { name: /KJV/ })).toBeVisible();
  await control.waitForTimeout(300);
  await control.screenshot({ path: 'test-results/07-dropdown-version.png' });
  await control.keyboard.press('Escape');
  // Output role dropdown inside a dialog.
  await control.getByTitle('Outputs').first().click();
  const role = control.getByRole('dialog').getByRole('combobox').first();
  await role.click();
  await expect(control.getByRole('option', { name: /Stage display/ })).toBeVisible();
  await control.waitForTimeout(300);
  await control.screenshot({ path: 'test-results/08-dropdown-role.png' });
  await control.keyboard.press('Escape');
  await control.keyboard.press('Escape');
  // Theme editor: font + background dropdowns with previews.
  await mode('Themes');
  await control
    .getByRole('region', { name: 'Themes' })
    .getByRole('button', { name: 'Duplicate' })
    .first()
    .click();
  const editor = control.getByRole('dialog');
  await editor.getByRole('combobox').nth(1).click();
  await control.waitForTimeout(300);
  await control.screenshot({ path: 'test-results/09-dropdown-background.png' });
  await control.keyboard.press('ArrowDown');
  await control.keyboard.press('Enter');
  await editor.getByRole('combobox').first().click();
  await control.waitForTimeout(300);
  await control.screenshot({ path: 'test-results/10-dropdown-font.png' });
  await control.keyboard.press('Escape');
  await control.keyboard.press('Escape');
  await mode('Show');
});

test('text slides: inspector edits the selected slide, add-slide card appends', async () => {
  await addToPlan('Slides');
  await control.getByText('Text slides').last().click();
  await mode('Edit'); // the slide inspector lives in the Edit workspace
  await expect(control.getByText('Slide 1 of 1')).toBeVisible();
  await control.getByRole('button', { name: 'Add slide' }).click();
  await expect(control.getByText('Slide 2 of 2')).toBeVisible();
  await control.getByLabel('Heading', { exact: true }).fill('Welcome');
  await control.getByLabel('Text', { exact: true }).fill('Coffee is served after the service');
  await expect(control.getByRole('button', { name: /Welcome/ }).first()).toBeVisible();
  await control.waitForTimeout(400);
  await control.screenshot({ path: 'test-results/11-inspector.png' });
  await mode('Show');
});

test('canvas editor: add a rectangle, drag it, and it shows on the output where you put it', async () => {
  const out = await outputPage();
  await (await servicePlan()).getByText('Text slides').last().click();
  await mode('Edit');
  const canvas = control.getByTestId('slide-canvas');
  await expect(canvas).toBeVisible();
  await control
    .getByRole('toolbar', { name: 'Canvas tools' })
    .getByRole('button', { name: 'Rectangle' })
    .click();
  const rect = canvas.getByRole('button', { name: 'Rectangle on the slide' });
  await expect(rect).toBeVisible();
  const box = (await rect.boundingBox())!;
  await control.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await control.mouse.down();
  await control.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 40, { steps: 6 });
  await control.mouse.up();
  const x = Number(await control.getByLabel('X', { exact: true }).inputValue());
  expect(x).toBeGreaterThan(660); // moved right of where it was added
  expect(x % 8).toBe(0); // snapped to the grid
  await control.waitForTimeout(200);
  await control.screenshot({ path: 'test-results/11b-canvas.png' });
  await mode('Show');
  // The slide being edited (with the rectangle) goes live; the output draws it at the same spot.
  await control
    .getByRole('list', { name: 'Slide list' })
    .getByRole('button', { name: /Welcome/ })
    .click();
  await expect(out.locator('.ls-object-rect')).toHaveCount(1);
  await expect
    .poll(() => out.locator('.ls-object-rect').evaluate((e) => (e as HTMLElement).style.left))
    .toBe(`${x}px`);
});

/** A small PowerPoint deck: two slides with titles, text and a note. */
function deckPptx(): Uint8Array {
  const sp = (text: string, ph?: string): string =>
    `<p:sp><p:nvSpPr><p:nvPr>${ph ? `<p:ph type="${ph}"/>` : ''}</p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`;
  return zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    'ppt/presentation.xml': strToU8(
      '<p:presentation><p:sldIdLst><p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst></p:presentation>',
    ),
    'ppt/_rels/presentation.xml.rels': strToU8(
      '<Relationships><Relationship Id="rId1" Type="x/slide" Target="slides/slide1.xml"/><Relationship Id="rId2" Type="x/slide" Target="slides/slide2.xml"/></Relationships>',
    ),
    'ppt/slides/slide1.xml': strToU8(
      `<p:sld>${sp('Deck welcome', 'title')}${sp('Glad you are here')}</p:sld>`,
    ),
    'ppt/slides/slide2.xml': strToU8(
      `<p:sld>${sp('Deck news', 'title')}${sp('Picnic on Saturday')}</p:sld>`,
    ),
  });
}

/** A two-page PDF (pdf.js rebuilds the cross-reference table it leaves out). */
const HANDOUT_PDF =
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R 4 0 R]/Count 2>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 320 180]>>endobj\n4 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 320 180]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n';

test('import slides: PowerPoint becomes text slides, a PDF becomes one picture per page', async () => {
  const plan = await servicePlan();
  const pick = (file: string) =>
    app.evaluate(({ dialog }, f) => {
      dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [f] });
    }, file);
  const pptx = join(dir, 'Deck.pptx');
  writeFileSync(pptx, deckPptx());
  await pick(pptx);
  await addToPlan('Import');
  await expect(plan.getByText('Deck', { exact: true })).toBeVisible();
  await mode('Show');
  const list = control.getByRole('list', { name: 'Slide list' });
  await expect(list.getByRole('button', { name: /Deck welcome/ })).toBeVisible();
  await expect(list.getByRole('button', { name: /Deck news/ })).toBeVisible();

  const pdf = join(dir, 'Handout.pdf');
  writeFileSync(pdf, HANDOUT_PDF);
  await pick(pdf);
  await addToPlan('Import');
  await expect(plan.getByText('Handout', { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(list.locator('.ls-object-image img')).toHaveCount(2); // one picture per page
  await control.screenshot({ path: 'test-results/11c-import.png' });
});

test('web page: shown over the output in an isolated view; Black screen takes it down', async () => {
  const views = () =>
    app.evaluate(({ BrowserWindow }) => {
      const out = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().includes('/output/'),
      );
      return out?.contentView.children.length ?? -1;
    });
  await outputPage();
  const before = await views();
  await addToPlan('Web page'); // opens its editor
  const address = control.getByLabel('Web address');
  await address.fill('http://insecure.example');
  await expect(control.getByText('Use a full secure address')).toBeVisible(); // not saved
  await address.fill('https://example.com/');
  await mode('Show');
  await control.getByRole('list', { name: 'Slide list' }).getByRole('button').first().click();
  await expect.poll(views).toBe(before + 1);
  await expect(
    control.locator('figure').filter({ hasText: 'Live' }).locator('.ls-web-url'),
  ).toHaveText('example.com');
  await control.locator('body').click({ position: { x: 5, y: 5 } });
  await control.keyboard.press('b'); // Black screen covers everything, the web page included
  await expect.poll(views).toBe(before);
  await control.keyboard.press('b');
  await expect.poll(views).toBe(before + 1);
  await control.getByRole('button', { name: /Turn off live/ }).click();
  await expect.poll(views).toBe(before);
});

test('hovering service plan rows never shifts the layout', async () => {
  const plan = await servicePlan();
  const boxes = () =>
    plan.locator('ol > li').evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return [Math.round(r.top), Math.round(r.height)];
      }),
    );
  // Bring both rows into view first: hover() scrolls to its target, which would move every row.
  await plan.getByText('John 3:16–17').scrollIntoViewIfNeeded();
  await plan.getByText('Word', { exact: true }).scrollIntoViewIfNeeded();
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
  const plan = await servicePlan();
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
  const plan = await servicePlan();
  const titles = () =>
    plan.locator('ol > li').evaluateAll((els) => els.map((e) => e.textContent.trim()));
  // Song: drag it from the library onto "Psalm 23:1–6" in the playlist (centre) → it lands
  // just before it. The sidebar shows the library meanwhile, so the playlist is the target.
  const library = control.getByRole('region', { name: 'Library' });
  await library.getByRole('button', { name: 'Songs', exact: true }).click();
  await mode('Show');
  await library
    .getByRole('button', { name: /Test Song/ })
    .first()
    .dragTo(control.getByRole('region', { name: 'Psalm 23:1–6', exact: true }), {
      targetPosition: { x: 60, y: 12 },
    });
  await servicePlan(); // back to the playlist in the sidebar
  // Inserted just before the item it was dropped on (wait for the save to land).
  await expect
    .poll(async () => {
      const t = await titles();
      return t[t.findIndex((x) => x.startsWith('Psalm 23:1–6')) - 1] ?? '';
    })
    .toMatch(/^Test Song/);
  // Verse: Bible → Genesis 1, drag verse 1 to the end of the plan.
  await mode('Bible');
  await control
    .getByRole('region', { name: 'Bible' })
    .getByRole('button', { name: 'Genesis', exact: true })
    .click();
  const before = (await titles()).length;
  await control
    .getByRole('button', { name: /In the beginning God created/ })
    .dragTo(plan.locator('ol'), { targetPosition: { x: 40, y: 5 } });
  await expect.poll(async () => (await titles()).length).toBe(before + 1);
  const afterVerse = await titles();
  expect(afterVerse.some((x) => x.startsWith('Genesis 1:1'))).toBe(true);
  await control.screenshot({ path: 'test-results/14-library-drag.png' });
});

test('undo / redo: ⌘Z and ⌘⇧Z revert and re-apply service edits', async () => {
  const plan = await servicePlan();
  const rows = () => plan.locator('ol > li').count();
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  const before = await rows();
  await addToPlan('Section');
  await expect.poll(rows).toBe(before + 1);
  await control.locator('body').click({ position: { x: 5, y: 5 } }); // make sure no text field has focus
  await control.keyboard.press(`${mod}+Z`);
  await expect.poll(rows).toBe(before);
  await control.keyboard.press(`${mod}+Shift+Z`);
  await expect.poll(rows).toBe(before + 1);
  await control.keyboard.press(`${mod}+Z`);
  await expect.poll(rows).toBe(before); // leaves the plan as it was for later tests
});

test('Preview first: click previews media, Space shows it full-screen without leftover text', async () => {
  await previewFirst(true);
  await mode('Show');
  await binTab('Media');
  await control
    .getByRole('region', { name: 'Bin' })
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
  await mode('Bible');
  const bibleRegion = control.getByRole('region', { name: 'Bible' });
  await bibleRegion.getByRole('button', { name: 'Genesis', exact: true }).click();
  await bibleRegion.getByRole('button', { name: /In the beginning God created/ }).click();
  await expect(previewMonitor.locator('.ls-text')).toContainText('In the beginning');
  await expect(out.locator('.ls-layer-media img')).toHaveCount(1); // still the media on screen
  await control.locator('body').click({ position: { x: 5, y: 5 } });
  await control.keyboard.press('Space');
  await expect(out.locator('.ls-text').last()).toContainText('In the beginning');
  await expect(out.locator('.ls-layer-media img')).toHaveCount(0, { timeout: 3000 }); // verse replaced the media
  await previewFirst(false);
  await mode('Show');
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

test('click goes live: a video from the bin plays on every output; Turn off live clears it', async () => {
  await binTab('Media');
  // Clicks go live by default: one click puts the clip on screen, no Preview step.
  await control
    .getByRole('region', { name: 'Bin' })
    .getByText('Seed clip')
    .locator('..')
    .locator('..')
    .locator('button')
    .first()
    .click();
  let out = await outputPage();
  let outVideo = out.locator('.ls-layer-media video');
  await expect(outVideo).toHaveCount(1);
  const transport = control.getByRole('group', { name: 'Video controls' });
  await expect(transport).toBeVisible();
  const position = transport.getByRole('slider', { name: 'Position' });
  // Sound comes from exactly one place: the Output window here, so the Program monitor is
  // silent; with no output at all, the monitor plays it instead of nobody.
  const monitorVideo = control.locator('figure').filter({ hasText: 'Live' }).locator('video');
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
  await expect(position).toBeEnabled(); // the clip's length is known, so the bar can seek
  const box = (await position.boundingBox())!;
  expect(box.width).toBeGreaterThan(120); // the bar always gets real width, even in a narrow column
  const drag = async (fromX: number, toX: number, releaseOff: boolean): Promise<void> => {
    await control.mouse.move(box.x + fromX, box.y + box.height / 2);
    await control.mouse.down();
    await control.mouse.move(box.x + toX, box.y + box.height / 2, { steps: 8 });
    if (releaseOff) await control.mouse.move(box.x + toX, box.y - 120, { steps: 5 });
    await control.mouse.up();
  };
  await expect.poll(() => outVideo.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  let before = await mediaCommands();
  await drag(4, box.width * 0.9, true);
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

test('new tools: reflow, props, messages with fields, timers on stage, coming soon', async () => {
  const out = await outputPage();
  // Props, messages and timers are show controls, under the output monitor.
  const bin = control.getByRole('region', { name: 'Show controls' });

  // Reflow: the whole text-slides item as one text block; blank lines split slides.
  await mode('Show');
  await (await servicePlan()).getByText('Text slides').last().click();
  await mode('Reflow');
  const text = control.getByLabel('All slide text');
  await expect(text).toHaveValue(/\[Welcome\]\nCoffee is served after the service/);
  await text.fill('[Welcome]\nCoffee is served after the service\n\nSee you next week');
  await control.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(control.getByText('2 slides')).toBeVisible();
  await control.screenshot({ path: 'test-results/18-reflow.png' });
  await mode('Show');

  // Props: make one from a library picture, show it, clear it from the clear stack.
  await binTab('Props');
  await bin.getByRole('button', { name: 'New prop' }).click();
  await bin.getByRole('combobox', { name: 'Picture' }).click();
  await control.getByRole('option', { name: /Seed image/ }).click();
  await bin.getByRole('button', { name: 'Create' }).click();
  await bin.getByRole('button', { name: 'Seed image', exact: true }).click();
  await expect(out.locator('.ls-prop-top-right img')).toHaveCount(1);
  await control.screenshot({ path: 'test-results/19-props.png' });
  await control.getByRole('button', { name: 'Clear Props' }).click();
  await expect(out.locator('.ls-prop')).toHaveCount(0);

  // Messages: fill the {number} field, show it as a lower third, clear the Messages layer.
  await binTab('Messages');
  const nursery = bin.getByRole('form', { name: 'Nursery' });
  await expect(nursery.getByRole('button', { name: 'Show' })).toBeDisabled(); // field still empty
  await nursery.getByLabel('number').fill('12');
  await nursery.getByRole('button', { name: 'Show' }).click();
  await expect(out.locator('.ls-lower-third')).toHaveText(
    'Parent of 12, please come to the nursery',
  );
  await control.screenshot({ path: 'test-results/20-messages.png' });
  await control.getByRole('button', { name: 'Clear Messages' }).click();
  await expect(out.locator('.ls-lower-third')).toHaveCount(0);

  // Timers: start the pre-service countdown; it runs on the stage display; reset takes it off.
  await binTab('Timers');
  const pre = bin.getByRole('group', { name: 'Pre-service' });
  await pre.getByRole('button', { name: 'Start' }).click();
  const stage = app.windows().find((w) => w.url().includes('/stage/'))!;
  await expect(stage.locator('.timer')).toContainText('Pre-service');
  await expect(stage.locator('.timer-value')).toHaveText(/^0[45]:\d\d$/);
  await control.screenshot({ path: 'test-results/21-timers.png' });
  await pre.getByRole('button', { name: 'Reset' }).click();
  await expect(stage.locator('.timer')).toHaveCount(0);

  // Coming soon: unbuilt tools say so, and Settings → Features lists the roadmap.
  await bin.getByRole('tab', { name: 'Audio' }).click();
  await expect(bin.getByTestId('soon-panel')).toContainText('Audio bin & playlists');
  await bin.getByRole('button', { name: "See everything that's coming" }).click();
  await expect(control.getByRole('heading', { name: 'Features' })).toBeVisible();
  await expect(control.locator('[data-feature="ndi"]')).toHaveAttribute('data-status', 'soon');
  await expect(control.locator('[data-feature="props"]')).toHaveAttribute(
    'data-status',
    'available',
  );
  await control.waitForTimeout(200);
  await control.screenshot({ path: 'test-results/22-features.png' });
  await control
    .getByRole('navigation', { name: 'Settings' })
    .getByRole('button', { name: 'General' })
    .click();
  await control.keyboard.press('Escape');
  await binTab('Media');
});

test('smoothness: slider drag commits once; output transitions do not accumulate', async () => {
  // Text-size slider: dragging stays local and commits a single update on release.
  await control.getByRole('button', { name: 'Settings', exact: true }).click();
  const slider = control.locator('#text-scale');
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
  // Only the words grow: the page sets --text-scale, it does not zoom the window.
  const scale = await control.evaluate(() => ({
    text: document.documentElement.style.getPropertyValue('--text-scale'),
    zoom: document.documentElement.style.zoom,
  }));
  expect(Number(scale.text)).toBeGreaterThan(1);
  expect(scale.zoom).toBe('');
  await control.screenshot({ path: 'test-results/23-text-size.png' });
  // Put the size back so later screenshots are comparable.
  await control.evaluate(() =>
    window.lampstand.command({ type: 'settings.update', payload: { patch: { textScale: 1 } } }),
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

test('Easy view lists the words; Turn off live takes everything off the screen', async () => {
  await mode('Show');
  const out = await outputPage();
  // The verse from the previous test is in the grid; Easy view shows its words, large.
  await control.getByRole('radio', { name: 'Easy' }).click();
  const list = control.getByRole('list', { name: 'Slide list' });
  await expect(list).toContainText('For God so loved the world');
  await control.screenshot({ path: 'test-results/23-easy-view.png' });
  await control.getByRole('radio', { name: 'Grid' }).click();
  // Turn off live (the ✕ beside the monitor): every layer comes off, and the ✕ goes away.
  const clearAll = control.getByRole('button', { name: /Turn off live/ });
  await expect(clearAll).toBeVisible();
  await clearAll.click();
  await expect(out.locator('.ls-text')).toHaveCount(0, { timeout: 5000 });
  await expect(clearAll).toBeHidden();
  // Put the verse back for the crash test.
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
