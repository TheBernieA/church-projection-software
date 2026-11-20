import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { createSocket } from 'node:dgram';
import { decodeOsc, encodeOsc } from '@lampstand/core';

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
  // Two short tones for the Audio tab (a playlist plays one into the next).
  const tone = (seconds: number, hz: number): Buffer => {
    const rate = 8000;
    const n = Math.round(seconds * rate);
    const wav = Buffer.alloc(44 + n * 2);
    wav.write('RIFF', 0);
    wav.writeUInt32LE(36 + n * 2, 4);
    wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20); // PCM
    wav.writeUInt16LE(1, 22); // mono
    wav.writeUInt32LE(rate, 24);
    wav.writeUInt32LE(rate * 2, 28);
    wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34);
    wav.write('data', 36);
    wav.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++)
      wav.writeInt16LE(Math.round(Math.sin((2 * Math.PI * hz * i) / rate) * 3000), 44 + i * 2);
    return wav;
  };
  for (const [id, name, secs, hz] of [
    ['seed-tone-a', 'Seed tone A', 1.5, 440],
    ['seed-tone-b', 'Seed tone B', 4, 660],
  ] as const) {
    const bytes = tone(secs, hz);
    writeFileSync(join(mediaDir, `${id}.wav`), bytes);
    writeFileSync(
      join(mediaDir, '.meta', `${id}.media.json`),
      JSON.stringify({
        id,
        schemaVersion: 1,
        createdAt: now,
        updatedAt: now,
        name,
        kind: 'audio',
        fileName: `${id}.wav`,
        mimeType: 'audio/wav',
        sizeBytes: bytes.length,
        hasThumbnail: false,
        isBackground: false,
        tags: [],
      }),
    );
  }
  const env = {
    ...process.env,
    LAMPSTAND_USER_DATA: join(dir, 'user'),
    LAMPSTAND_LIBRARY: join(dir, 'library'),
    LAMPSTAND_RECORDINGS: join(dir, 'recordings'),
    NODE_ENV: 'test',
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_RENDERER_URL;
  // Chromium's fake camera and microphone stand in for real devices (no OS prompt, no hardware).
  app = await electron.launch({
    args: ['.', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    cwd: join(__dirname, '..'),
    env,
  });
  const mainOutput: string[] = [];
  app.process().stdout?.on('data', (d: Buffer) => mainOutput.push(d.toString()));
  app.process().stderr?.on('data', (d: Buffer) => mainOutput.push(d.toString()));
  control = await app.firstWindow();
  const pageErrors: string[] = [];
  control.on('pageerror', (e) => pageErrors.push(e.message));
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
  // LAMPSTAND_KEEP=1 keeps the library and logs to look at after a run.
  if (!process.env.LAMPSTAND_KEEP) rmSync(dir, { recursive: true, force: true });
  else console.log('KEPT', dir);
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
    // The bin's library views: "All media" and "Backgrounds".
    const label = name === 'Media' ? 'All media' : name;
    const bin = control.getByRole('region', { name: 'Bin' });
    if ((await bin.count()) === 0)
      await control.getByRole('banner').getByRole('button', { name: 'Media', exact: true }).click();
    // Its categories are in the left column's media sidebar.
    const cat = control
      .getByRole('navigation', { name: 'Media library' })
      .getByRole('button', { name: label, exact: true });
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
      .getByRole('button', { name: 'Sample Sunday service', exact: true })
      .click();
  return plan;
};

/** Add something to the service plan from its "+ Add" menu. */
/** A slide card's own button (not the pencil beside it that opens it in Edit). */
const SLIDE = /^(?!Edit slide)/;

const addToPlan = async (name: string) => {
  await (await servicePlan()).getByRole('button', { name: 'Add', exact: true }).click();
  await control.getByRole('menuitem', { name, exact: true }).click();
};

/** Say yes in the app's confirmation dialog (the button that does it, e.g. "Delete"). */
const answer = async (button: string) => {
  const dialog = control.getByRole('dialog');
  await dialog.getByRole('button', { name: button, exact: true }).click();
  await expect(dialog).toHaveCount(0);
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

test('new song: name it, type on its slides, group them, add to service → output shows it', async () => {
  const library = control.getByRole('region', { name: 'Library' });
  await library.getByRole('button', { name: 'Songs', exact: true }).click();
  await library.getByRole('button', { name: 'Add to the library' }).click();
  await control.getByRole('menuitem', { name: /New song/ }).click();
  const dialog = control.getByRole('dialog', { name: 'New song' });
  await dialog.getByLabel('Title').fill('Test Song');
  await expect(dialog.getByRole('combobox', { name: 'Playlist' })).toHaveText('No playlist');
  await dialog.getByRole('button', { name: 'Create' }).click();
  // It opens in Edit on its first (empty) slide, ready to type.
  const words = control.getByRole('textbox', { name: 'Words', exact: true });
  await words.fill('Hallelujah test line');
  await control.screenshot({ path: 'test-results/05a-song-typing.png' });
  // A new song opens expanded (the library makes way); Collapse brings it back beside it.
  await expect(library).toHaveCount(0);
  await control
    .getByRole('button', { name: 'Show the playlist and output beside the editor' })
    .click();
  await expect(library).toBeVisible();
  await control.getByRole('button', { name: 'Expand the editor to the whole window' }).click();
  await expect(library).toHaveCount(0);
  // ⇧⌘N: a new slide after it, typed straight away.
  await words.press('ControlOrMeta+Shift+N');
  await expect(words).toHaveValue('');
  // Key by key: the slide joins the song on the first key, and typing carries on unbroken.
  await words.pressSequentially('Chorus test line');
  await expect(words).toHaveValue('Chorus test line');
  await words.press('Escape');
  await expect(words).toHaveCount(0);
  const list = control.getByRole('navigation', { name: 'Slides' });
  await expect(list.getByRole('button', { name: /^Slide \d of 2$/ })).toHaveCount(2);
  // Right-click the second slide: group it as the chorus.
  await list.getByRole('button', { name: 'Slide 2 of 2' }).click({ button: 'right' });
  // Its submenu opens with → once Group is highlighted (as from the keyboard).
  await control.getByRole('menuitem', { name: 'Group' }).hover();
  await control.keyboard.press('ArrowRight');
  const chorus = control.getByRole('menuitem', { name: 'Chorus', exact: true });
  await expect(chorus).toBeVisible();
  await chorus.click();
  await expect(list.getByText('Chorus', { exact: true })).toBeVisible();
  await control.screenshot({ path: 'test-results/05-song-editor.png' });
  // ⌥↩ breaks a slide at the caret; a slide emptied when typing stops goes.
  await control.getByTestId('song-canvas').dblclick();
  await words.press('End');
  await words.pressSequentially(' extra');
  for (let i = 0; i < 6; i++) await words.press('ArrowLeft');
  await words.press('Alt+Enter');
  await expect(words).toHaveValue('extra');
  await expect(list.getByRole('button', { name: /^Slide \d of 3$/ })).toHaveCount(3);
  await words.fill('');
  await words.press('Escape');
  await expect(list.getByRole('button', { name: /^Slide \d of 2$/ })).toHaveCount(2);
  // Into the service from the library (double-click), then show it.
  await mode('Show');
  await library.getByRole('button', { name: /Test Song/ }).dblclick();
  await expect(control.getByRole('region', { name: 'Test Song' })).toBeVisible();
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
  // Under the monitor: ◀ / ▶ step the screens, with the slides either side small beside them;
  // hovering one shows it large enough to read.
  const stepper = control.getByTestId('live-stepper');
  await expect(stepper).toContainText('2 / 2');
  await stepper.getByRole('button', { name: /^Show / }).hover();
  await expect(control.getByTestId('live-stepper-zoom')).toContainText('Before: ');
  await control.waitForTimeout(300);
  await control.screenshot({ path: 'test-results/03b-live-stepper.png' });
  await stepper.getByRole('button', { name: /^Previous slide/ }).click();
  await expect(out.locator('.ls-text').last()).toContainText('Hallelujah test line');
  await expect(stepper).toContainText('1 / 2');
  // On the first slide, ◀ carries on into the item before it (across the section heading),
  // landing on its last slide; ▶ comes back.
  await stepper.getByRole('button', { name: /^Go to the previous item/ }).hover();
  await expect(control.getByTestId('live-stepper-zoom')).toContainText('Previous item: ');
  await stepper.getByRole('button', { name: /^Previous slide/ }).click();
  await expect(out.locator('.ls-text').last()).toContainText('Nor height, nor depth');
  await expect(stepper).toContainText('6 / 6');
  await stepper.getByRole('button', { name: /^Next slide/ }).click();
  await expect(out.locator('.ls-text').last()).toContainText('Hallelujah test line');
  await stepper.getByRole('button', { name: /^Show / }).click(); // the next one, small
  await expect(out.locator('.ls-text').last()).toContainText('Chorus test line');
});

test('songs: build arrangements and a translation, then pick them per item', async () => {
  const out = await outputPage();
  await mode('Edit'); // Test Song (just added to the service) opens in the song editor
  // Chords go in brackets inside lines; only the stage display shows them.
  const canvas = control.getByTestId('song-canvas');
  const words = control.getByRole('textbox', { name: 'Words', exact: true });
  // Opened from the Edit tab, it's compact: the slides run along the bottom.
  const list = control.getByRole('list', { name: 'Slides' });
  await list.getByRole('button', { name: 'Slide 1 of 2' }).click();
  await canvas.dblclick();
  await words.fill('[G]Hallelujah test line');
  await words.press('Escape');
  await list.getByRole('button', { name: 'Slide 2 of 2' }).click();
  await canvas.dblclick();
  await words.fill('[C]Chorus test line');
  await words.press('Escape');
  await control.getByRole('button', { name: 'Add arrangement' }).click();
  await expect(control.getByLabel('Arrangement name')).toHaveCount(2); // the new row is there
  await control.getByLabel('Arrangement name').last().fill('Short');
  await control.getByLabel('Order for Short').fill('C V1');
  await control.getByLabel('Language', { exact: true }).fill('es');
  await control
    .getByLabel('Translated words')
    .fill('[Verse 1]\nLinea de prueba\n\n[Chorus]\nCoro de prueba');
  // The Text tab formats the song's words (kept with the song): all capitals here.
  await control.getByRole('radio', { name: 'Text', exact: true }).click();
  await control.getByRole('button', { name: 'All capitals' }).click();
  await expect(control.getByRole('button', { name: 'All capitals' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await control.screenshot({ path: 'test-results/05e-text-tab.png' });
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
  await expect(out.locator('.ls-text').last()).toHaveCSS('text-transform', 'uppercase');
  await expect(out.locator('.ls-text').last()).not.toContainText('['); // the room never sees chords
  const stage = app.windows().find((w) => w.url().includes('/stage/'))!;
  await expect(stage.locator('.ls-st-chords .chord-row')).toHaveText('C');
  await expect(stage.locator('.ls-st-chords .lyric-row')).toHaveText('Chorus test line');
  // Transpose up a tone: the band's chart follows, the room's text doesn't change.
  const up = control.getByRole('button', { name: 'Transpose up a semitone' });
  await up.click();
  await up.click();
  await expect(control.getByTestId('transpose-value')).toHaveText('+2');
  await expect(stage.locator('.ls-st-chords .chord-row')).toHaveText('D');
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
  await control.getByRole('option', { name: 'Default' }).click();
  await expect(slides.locator('li').first()).toContainText('Verse 1');
});

test('theme effects: a glow set in the theme editor reaches the output', async () => {
  const out = await outputPage();
  await mode('Themes');
  await control
    .getByRole('region', { name: 'Themes' })
    .getByRole('button', { name: 'Edit', exact: true })
    .first()
    .click();
  const editor = control.getByRole('dialog');
  // A built-in theme is edited as a copy of your own, and the editor says so.
  await expect(editor.getByRole('note')).toContainText('saved as a new theme');
  await editor.getByLabel('Name', { exact: true }).fill('Glow test');
  await editor.getByRole('checkbox', { name: 'Glow' }).check();
  await editor.getByLabel('Brightness').fill('0.8');
  await control.waitForTimeout(200);
  await control.screenshot({ path: 'test-results/05d-theme-effects.png' });
  await editor.getByRole('button', { name: 'Save theme' }).click();
  // Make it the lyrics theme, then show a song slide.
  const themes = control.getByRole('region', { name: 'Themes' });
  await themes
    .getByRole('radiogroup', { name: 'For' })
    .getByRole('radio', { name: 'Lyrics' })
    .click();
  // Clicking a theme asks where to use it: every output, or just one.
  await themes.getByRole('button', { name: 'Use Glow test' }).click();
  await control.getByRole('menuitem', { name: 'All outputs' }).click();
  await expect(themes.locator('[data-selected="true"]')).toContainText('Glow test');
  // Only the alternate (HDMI) output takes a lower third, for a video mixer.
  await themes
    .getByRole('radiogroup', { name: 'Layout' })
    .getByRole('radio', { name: 'Lower third' })
    .click();
  await themes.getByRole('button', { name: 'Use Stream lower third' }).click();
  await control.getByRole('menuitem', { name: 'Alternate (HDMI)' }).click();
  await expect
    .poll(async () => {
      const r = await control.evaluate(() => window.lampstand.query('settings.get'));
      return r.ok ? r.value.outputThemes.alternate.lyrics : null;
    })
    .toBe('theme-stream-lower-third');
  await expect(themes.locator('[data-output="alternate"]')).toContainText('Stream lower third');
  await expect(themes.locator('[data-output="stream"]')).toContainText('follows main');
  await control.waitForTimeout(300);
  await control.screenshot({ path: 'test-results/05e-themes-outputs.png' });
  await themes
    .locator('[data-output="alternate"]')
    .getByRole('button', { name: 'Follow main' })
    .click();
  // Picking an item in the plan leaves Themes for Show.
  await (await servicePlan()).getByText('Test Song').first().click();
  await expect(control.getByRole('list', { name: 'Slide list' })).toBeVisible();
  await mode('Show');
  await (await servicePlan()).getByText('Test Song').first().click();
  await control
    .getByRole('list', { name: 'Slide list' })
    .getByRole('button', { name: SLIDE })
    .first()
    .click();
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
  await control
    .getByRole('list', { name: 'Slide list' })
    .getByRole('button', { name: SLIDE })
    .first()
    .click();
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
  await control
    .getByRole('list', { name: 'Slide list' })
    .getByRole('button', { name: SLIDE })
    .first()
    .click();
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
  // Scrolling over a focused number field never changes it (a trackpad used to nudge 320 → 290).
  await nav.getByRole('button', { name: 'Scripture' }).click();
  const chars = control.getByRole('spinbutton').first();
  const was = await chars.inputValue();
  await chars.click();
  await chars.hover();
  await control.mouse.wheel(0, 300);
  await control.mouse.wheel(0, -300);
  await control.waitForTimeout(300);
  await expect(chars).toHaveValue(was);
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
  // Going live: the stream set-up recipes, including the low-delay direct link.
  await control.locator('[data-howto="direct"] summary').click();
  await expect(control.locator('[data-howto="direct"]')).toContainText('udp://192.168.1.50:9000');
  await expect(control.locator('[data-howto="youtube"]')).toHaveCount(1);
  // The screen recipes: fitting a projector, blending, the multi-view.
  await control.locator('[data-howto="edgeBlend"] summary').click();
  await expect(control.locator('[data-howto="edgeBlend"]')).toContainText(
    'Blend the audience screens',
  );
  await expect(control.locator('[data-howto="fitScreens"]')).toHaveCount(1);
  await expect(control.locator('[data-howto="multiview"]')).toHaveCount(1);
  await control.locator('[data-howto="midi"] summary').click();
  await expect(control.locator('[data-howto="midi"]')).toContainText('Press Learn');
  await control.locator('[data-howto="midi"]').scrollIntoViewIfNeeded();
  await control.screenshot({ path: 'test-results/06-guide-recipe.png' });
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
  // Search: "stream key" finds the destinations on Streaming; Enter opens it there.
  const search = nav.getByRole('searchbox', { name: 'Search settings' });
  await search.fill('stream key');
  await expect(nav.getByRole('group', { name: 'Search results' })).toContainText(
    'Where it streams',
  );
  await search.press('Enter');
  await expect(control.getByRole('heading', { name: 'Streaming', exact: true })).toBeVisible();
  await expect(search).toHaveValue('');
  await control.waitForTimeout(400);
  await control.screenshot({ path: 'test-results/06-settings-streaming.png' });
  // ↑/↓ walk the sidebar.
  await nav.getByRole('button', { name: 'Streaming' }).focus();
  await control.keyboard.press('ArrowUp');
  await expect(
    control.getByRole('heading', { name: 'Control surfaces', exact: true }),
  ).toBeVisible();
  await control.keyboard.press('ArrowUp');
  await expect(control.getByRole('heading', { name: 'Audio', exact: true })).toBeVisible();
  await control.screenshot({ path: 'test-results/06-settings-audio.png' });
  await nav.getByRole('button', { name: 'General' }).click();
  await control.keyboard.press('Escape');
  // ⌘, / Ctrl+, opens Settings.
  await control.keyboard.press(process.platform === 'darwin' ? 'Meta+Comma' : 'Control+Comma');
  await expect(control.getByRole('heading', { name: 'General' })).toBeVisible();
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
  // Audience and Stage each open their own screens menu; both lead to the output settings.
  await control.getByRole('button', { name: /^Audience:/ }).click();
  await expect(control.getByRole('menuitemcheckbox', { name: /Rehearsal window/ })).toBeChecked();
  await control.waitForTimeout(300);
  await control.screenshot({ path: 'test-results/08-audience-menu.png' });
  await control.keyboard.press('Escape');
  await control.getByRole('button', { name: /^Stage:/ }).click();
  await expect(control.getByRole('menuitem', { name: 'Edit the stage layout' })).toBeVisible();
  await control.getByRole('menuitem', { name: 'Output settings…' }).click();
  const dialog = control.getByRole('dialog', { name: 'Outputs' });
  // The alternate output as a key feed for a video mixer: words over green.
  const keyFeed = dialog.getByRole('region', { name: /key feed for a video mixer/ });
  await keyFeed.getByRole('radio', { name: 'Green' }).click();
  await expect
    .poll(async () => {
      const r = await control.evaluate(() => window.lampstand.query('settings.get'));
      return r.ok ? r.value.keyFeed.mode : null;
    })
    .toBe('green');
  await expect(keyFeed).toContainText('chroma key');
  await control.screenshot({ path: 'test-results/08a-outputs-key.png' });
  await keyFeed.getByRole('radio', { name: 'Full picture' }).click();
  await expect(dialog.getByRole('radio', { name: 'Stage' }).first()).toBeVisible();
  await expect(dialog.getByRole('switch', { name: /Rehearsal/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await control.waitForTimeout(300);
  await control.screenshot({ path: 'test-results/08-outputs.png' });
  await control.keyboard.press('Escape');
  // Theme editor: font + background dropdowns with previews.
  await mode('Themes');
  await control
    .getByRole('region', { name: 'Themes' })
    .getByRole('button', { name: 'Edit', exact: true })
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
  await addToPlan('Slides'); // something new opens in Edit, expanded to the whole window
  await expect(control.getByRole('region', { name: 'Library' })).toHaveCount(0);
  // Expanded, the inspector is always there, and the same tool bar as a song's.
  await expect(control.getByRole('button', { name: 'Hide inspector' })).toHaveCount(0);
  await expect(control.getByRole('radio', { name: 'Slide', exact: true })).toBeVisible();
  const tools = control.getByRole('toolbar', { name: 'Slide tools' });
  await expect(tools.getByRole('button', { name: 'Text', exact: true })).toBeVisible();
  await expect(tools.getByRole('button', { name: 'Slide', exact: true })).toBeVisible();
  await control
    .getByRole('button', { name: 'Show the playlist and output beside the editor' })
    .click();
  await expect(control.getByText('Slide 1 of 1')).toBeVisible();
  await control.getByRole('button', { name: 'Add slide' }).click();
  await expect(control.getByText('Slide 2 of 2')).toBeVisible();
  // A new slide opens ready to type on it; Esc stops, the inspector edits it too.
  await expect(
    control.getByTestId('slide-canvas').getByLabel('Text', { exact: true }),
  ).toBeFocused();
  await control.keyboard.press('Escape');
  await control.getByLabel('Heading', { exact: true }).fill('Welcome');
  await control
    .getByRole('textbox', { name: 'Text', exact: true })
    .fill('Coffee is served after the service');
  await expect(control.getByRole('button', { name: /Welcome/ }).first()).toBeVisible();
  await control.waitForTimeout(400);
  await control.screenshot({ path: 'test-results/11-inspector.png' });
  // The Text tab: the words as a numbered list, then back to the theme.
  const canvas = control.getByTestId('slide-canvas');
  await control.getByRole('radio', { name: 'Text', exact: true }).click();
  await control.getByRole('button', { name: 'Numbers' }).click();
  await expect(canvas.locator('.ls-text ol li')).toHaveText(['Coffee is served after the service']);
  // Text colour: a palette to pick from (and custom colours), shown as a real swatch.
  await control.getByRole('button', { name: 'Text colour' }).click();
  await expect(control.getByRole('menuitem', { name: 'Add a custom colour' })).toBeVisible();
  await control.waitForTimeout(400); // after the menu's fade-in
  await control.screenshot({ path: 'test-results/11d-colour-palette.png' });
  await control.getByRole('menuitem', { name: '#ff0000' }).click();
  await expect(canvas.locator('.ls-text')).toHaveCSS('color', 'rgb(255, 0, 0)');
  await control.screenshot({ path: 'test-results/11c-text-tab.png' });
  await control.getByRole('button', { name: 'Use theme' }).click();
  await expect(canvas.locator('.ls-text ol')).toHaveCount(0);
  // The text box: drag its right grip in to make it narrower (kept with the item).
  const box = canvas.getByTestId('text-box');
  const wide = (await box.boundingBox())!.width;
  const grip = (await box.locator('[data-grip="e"]').boundingBox())!;
  await control.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await control.mouse.down();
  await control.mouse.move(grip.x - 80, grip.y + grip.height / 2, { steps: 5 });
  await control.mouse.up();
  await expect.poll(async () => (await box.boundingBox())!.width).toBeLessThan(wide - 40);
  await control.getByRole('radio', { name: 'Slide', exact: true }).click();
  // The inspector can be hidden for a bigger canvas, and brought back.
  await control.getByRole('button', { name: 'Hide inspector' }).click();
  await expect(control.getByLabel('Heading', { exact: true })).toBeHidden();
  await control.screenshot({ path: 'test-results/11b-inspector-hidden.png' });
  await control.getByRole('button', { name: 'Show inspector' }).click();
  await expect(control.getByLabel('Heading', { exact: true })).toBeVisible();
  await mode('Show');
});

test('canvas editor: add a rectangle, drag it, and it shows on the output where you put it', async () => {
  const out = await outputPage();
  await (await servicePlan()).getByText('Text slides').last().click();
  await mode('Edit');
  const canvas = control.getByTestId('slide-canvas');
  await expect(canvas).toBeVisible();
  await control
    .getByRole('toolbar', { name: 'Slide tools' })
    .getByRole('button', { name: 'Rectangle' })
    .click();
  const rect = canvas.getByRole('button', { name: 'Rectangle on the slide' });
  await control.waitForTimeout(300);
  await control.screenshot({ path: 'test-results/44-edit-workspace.png' });
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
  // The filmstrip: duplicate a slide from its corner, then delete the copy.
  const strip = control.getByRole('list', { name: 'Slides' });
  const before = await strip.getByRole('listitem').count();
  await strip.getByRole('listitem').first().hover();
  await strip.getByRole('button', { name: 'Options for slide 1' }).click();
  await control.getByRole('menuitem', { name: 'Duplicate' }).click();
  await expect(strip.getByRole('listitem')).toHaveCount(before + 1);
  await strip.getByRole('listitem').nth(1).hover();
  await strip.getByRole('button', { name: 'Options for slide 2' }).click();
  await control.getByRole('menuitem', { name: 'Delete slide' }).click();
  await expect(strip.getByRole('listitem')).toHaveCount(before);
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
  await control
    .getByRole('list', { name: 'Slide list' })
    .getByRole('button', { name: SLIDE })
    .first()
    .click();
  await expect.poll(views).toBe(before + 1);
  await expect(
    control.locator('figure').filter({ hasText: 'Live' }).locator('.ls-web-url'),
  ).toHaveText('example.com');
  await control.locator('body').click({ position: { x: 5, y: 5 } });
  await control.keyboard.press('Shift+B'); // Black screen covers everything, the web page included
  await expect.poll(views).toBe(before);
  await control.keyboard.press('Shift+B');
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
  // The chapters fold away once one is picked; Chapter brings them back. The arrows step books.
  const bible = control.getByRole('region', { name: 'Bible' });
  await bible.getByRole('button', { name: '2', exact: true }).click();
  await expect(bible.getByRole('button', { name: /Thus the heavens and the earth/ })).toBeVisible();
  await expect(bible.getByRole('button', { name: '3', exact: true })).toBeHidden();
  await bible.getByRole('button', { name: 'Chapter 2' }).click();
  await expect(bible.getByRole('button', { name: '3', exact: true })).toBeVisible();
  await expect(bible.getByRole('button', { name: /^Previous book/ })).toBeDisabled();
  await bible.getByRole('button', { name: 'Next book: Exodus' }).click();
  await expect(bible.getByRole('button', { name: /Now these are the names/ })).toBeVisible();
  await bible.getByRole('button', { name: 'Previous book: Genesis' }).click();
  await expect(bible.getByRole('button', { name: /In the beginning God created/ })).toBeVisible();
  await bible.getByRole('button', { name: 'Next book: Exodus' }).click();
  await bible.getByRole('button', { name: 'Next book: Leviticus' }).click();
  await control.screenshot({ path: 'test-results/14b-bible-books.png' });
  // Other languages show their own book names: Riveduta's Leviticus is "Levitico".
  await bible.getByRole('combobox', { name: 'Version' }).click();
  await control.getByRole('option', { name: /RIV/ }).click();
  await expect(bible.getByRole('button', { name: 'Next book: Numeri' })).toBeVisible();
  await expect(bible.getByRole('button', { name: 'Previous book: Esodo' })).toBeVisible();
  await expect(bible.getByRole('button', { name: 'Capitolo 1' })).toBeVisible();
  await control.screenshot({ path: 'test-results/14c-bible-italian.png' });
  await bible.getByRole('combobox', { name: 'Version' }).click();
  await control.getByRole('option', { name: /KJV/ }).click();
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
    .getByRole('button', { name: 'Seed image', exact: true })
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
  // A click on the tile only opens it (nothing changes on screen)...
  const bin = control.getByRole('region', { name: 'Bin' });
  await bin.getByRole('button', { name: 'Seed clip', exact: true }).click();
  await control.waitForTimeout(400);
  await expect((await outputPage()).locator('.ls-layer-media video')).toHaveCount(0);
  // ...its play button puts it on screen.
  await bin.getByRole('button', { name: 'Show now: Seed clip' }).click();
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
  await transport.screenshot({ path: 'test-results/28-video-transport.png' });
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
  await control.keyboard.press('Shift+P');
  await expect.poll(() => outVideo.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  // Skip buttons: forward 15 s on a 6 s clip stops at the end; back 15 s returns to the start.
  await transport.getByRole('button', { name: 'Forward 15 seconds' }).click();
  await expect
    .poll(() => outVideo.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(5);
  await transport.getByRole('button', { name: 'Back 15 seconds' }).click();
  await expect
    .poll(() => outVideo.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeLessThan(0.5);
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

test('video cues: play in Preview, wait for Play, playback options trim the clip', async () => {
  const out = await outputPage();
  const outVideo = out.locator('.ls-layer-media video');
  const bin = control.getByRole('region', { name: 'Bin' });
  const transport = control.getByRole('group', { name: 'Video controls' });
  const setSetting = (patch: Record<string, unknown>) =>
    control.evaluate(
      (p) => window.lampstand.command({ type: 'settings.update', payload: { patch: p } }),
      patch,
    );

  // Preview first: the clip waits in Preview, and the transport plays it there, silently.
  await previewFirst(true);
  await binTab('Media');
  await bin.getByRole('button', { name: 'Seed clip', exact: true }).click();
  await expect(transport.getByText('In Preview (only you can see it)')).toBeVisible();
  await transport.getByRole('button', { name: 'Play' }).click();
  const previewVideo = control.locator('figure').filter({ hasText: 'Preview' }).locator('video');
  await expect
    .poll(() => previewVideo.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(0.5);
  await expect(outVideo).toHaveCount(0);
  await control.screenshot({ path: 'test-results/26-preview-playback.png' });
  await previewFirst(false);

  // "Wait for Play": a clip that goes live sits on its first frame until Play...
  await setSetting({ mediaAutoplay: false, pickShowsNow: true });
  await bin.getByRole('button', { name: 'Seed clip', exact: true }).click();
  await expect(outVideo).toHaveCount(1);
  await control.waitForTimeout(800);
  expect(await outVideo.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  await transport.getByRole('button', { name: 'Play' }).click();
  await expect.poll(() => outVideo.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
  // ...but the tile's play button ("Show now") always plays it at once.
  await control.evaluate(() =>
    window.lampstand.command({ type: 'live.clearLayer', payload: { layer: 'media' } }),
  );
  await expect(outVideo).toHaveCount(0);
  await bin.getByRole('button', { name: 'Seed clip', exact: true }).hover();
  await bin.getByRole('button', { name: 'Show now: Seed clip' }).click();
  await expect(outVideo).toHaveCount(1);
  await expect.poll(() => outVideo.evaluate((v: HTMLVideoElement) => v.paused)).toBe(false);
  await setSetting({ mediaAutoplay: true, pickShowsNow: false });

  // Playback options on a cue in the playlist: start 2 s in.
  await bin.getByRole('button', { name: 'Seed clip', exact: true }).dblclick();
  const cue = control.getByRole('region', { name: 'Seed clip', exact: true }).first();
  await cue.getByRole('button', { name: 'Playback options' }).click();
  const dialog = control.getByRole('dialog');
  await dialog.getByLabel('Start at').fill('2');
  await dialog.getByLabel('Start at').press('Enter');
  await dialog.getByRole('radio', { name: 'Loop' }).click();
  await control.screenshot({ path: 'test-results/27-playback-options.png' });
  await dialog.getByRole('button', { name: 'Done' }).click();
  await cue.getByRole('list').getByRole('button').first().click();
  await expect
    .poll(() => outVideo.evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(1.9);
  await control.getByRole('button', { name: /^Turn off live/ }).click();
  await expect(outVideo).toHaveCount(0);
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
  await expect(control.getByText('Unsaved changes')).toBeVisible();
  // The slides beside the text are real renders; clicking one jumps to its words.
  const previews = control.getByRole('list', { name: 'Slides' });
  await expect(previews.getByRole('listitem')).toHaveCount(2);
  await previews.getByRole('button', { name: /^Slide 2/ }).click();
  await expect
    .poll(() => text.evaluate((el: HTMLTextAreaElement) => el.selectionStart))
    .toBe('[Welcome]\nCoffee is served after the service\n\n'.length);
  await control.keyboard.press(process.platform === 'darwin' ? 'Meta+S' : 'Control+S');
  await expect(control.getByText('Unsaved changes')).toHaveCount(0);
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
  // Props live in the strip's "…" menu by default; "…" shows a red dot while one is up.
  await control.getByRole('button', { name: 'More layers' }).click();
  await control.getByRole('menuitem', { name: 'Clear Props' }).click();
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
  await bin.getByRole('tab', { name: 'Macros' }).click();
  await expect(bin.getByTestId('soon-panel')).toContainText('Macros');
  await bin.getByRole('button', { name: "See everything that's coming" }).click();
  await expect(control.getByRole('heading', { name: 'Features' })).toBeVisible();
  await expect(control.locator('[data-feature="sdi"]')).toHaveAttribute('data-status', 'soon');
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

test('a cleared layer comes back with one click', async () => {
  const out = await outputPage();
  await expect(out.locator('.ls-text')).toContainText('For God so loved the world');
  // Clear the slide: the button turns into "Bring back", and the verse returns.
  await control.getByRole('button', { name: 'Clear Slide', exact: true }).click();
  await expect(out.locator('.ls-text')).toHaveCount(0, { timeout: 5000 });
  const back = control.getByRole('button', { name: 'Bring back Slide', exact: true });
  await expect(back).toBeEnabled();
  await control.screenshot({ path: 'test-results/24-restore-layer.png' });
  await back.click();
  await expect(out.locator('.ls-text')).toContainText('For God so loved the world', {
    timeout: 5000,
  });
  await expect(control.getByRole('button', { name: 'Clear Slide', exact: true })).toBeEnabled();
  // The same for the background.
  await control.getByRole('button', { name: 'Clear Background', exact: true }).click();
  await expect(out.locator('.ls-bg')).toHaveCount(0, { timeout: 5000 });
  await control.getByRole('button', { name: 'Bring back Background', exact: true }).click();
  await expect(out.locator('.ls-bg')).toHaveCount(1, { timeout: 5000 });
  // Turn off live, then the power button brings it all back. A quick second click (a
  // double-click) is ignored, so the screen never flashes back on by accident.
  await control.getByRole('button', { name: /^Turn off live/ }).click();
  await expect(out.locator('.ls-text')).toHaveCount(0, { timeout: 5000 });
  const power = control.getByRole('button', { name: 'Bring back what was live' });
  await power.click();
  await control.waitForTimeout(300);
  await expect(out.locator('.ls-text')).toHaveCount(0);
  await control.waitForTimeout(900);
  await power.click();
  await expect(out.locator('.ls-text')).toContainText('For God so loved the world', {
    timeout: 5000,
  });
  await expect(out.locator('.ls-bg')).toHaveCount(1);
});

test('clear groups: made in Settings, used from the layer strip', async () => {
  const out = await outputPage();
  await expect(out.locator('.ls-text')).toContainText('For God so loved the world');
  await control.getByRole('button', { name: 'Settings', exact: true }).click();
  await control
    .getByRole('navigation', { name: 'Settings' })
    .getByRole('button', { name: 'Presenting' })
    .click();
  await control.getByRole('button', { name: '+ Add clear group' }).click();
  // New groups clear the slide and props; leave the background.
  await expect(
    control.getByRole('group', { name: 'Layers Clear group 1 clears' }).getByRole('button', {
      name: 'Slide',
    }),
  ).toHaveAttribute('aria-pressed', 'true');
  await control.screenshot({ path: 'test-results/28-clear-groups.png' });
  await control.keyboard.press('Escape');
  await control.getByRole('button', { name: 'More layers' }).click();
  await control.getByRole('menuitem', { name: 'Clear: Clear group 1' }).click();
  await expect(out.locator('.ls-text')).toHaveCount(0, { timeout: 5000 });
  await expect(out.locator('.ls-bg')).toHaveCount(1);
  // The slide's own button brings it back.
  await control.getByRole('button', { name: 'Bring back Slide', exact: true }).click();
  await expect(out.locator('.ls-text')).toContainText('For God so loved the world');
});

test('screen masks: made in Settings › Screens, shape the audience output', async () => {
  const out = await outputPage();
  const stage = out.locator('.ls-stage');
  await control.getByRole('banner').getByRole('button', { name: 'More' }).click();
  await control.getByRole('menuitem', { name: 'Masks…' }).click();
  await control.getByRole('button', { name: 'Add mask' }).click();
  // Use it on the audience screens: the output is clipped, and so is the Program monitor.
  await control.getByRole('combobox', { name: 'Audience screens' }).click();
  await control.getByRole('option', { name: 'Mask 1' }).click();
  await expect
    .poll(() => stage.evaluate((e) => (e as HTMLElement).style.clipPath))
    .toContain('inset(5%'); // Chromium writes equal insets once: inset(5% round 4vmin)
  await control.getByRole('radio', { name: 'Oval' }).click();
  await expect
    .poll(() => stage.evaluate((e) => (e as HTMLElement).style.clipPath))
    .toContain('ellipse(');
  await expect(control.getByRole('radio', { name: 'Oval' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await control.waitForTimeout(300);
  await control.screenshot({ path: 'test-results/29-screen-masks.png' });
  // Back to the full screen.
  await control.getByRole('combobox', { name: 'Audience screens' }).click();
  await control.getByRole('option', { name: 'No mask' }).click();
  await expect.poll(() => stage.evaluate((e) => (e as HTMLElement).style.clipPath)).toBe('');
  await control.keyboard.press('Escape');
});

test('looks: switch which layers each screen shows from the toolbar', async () => {
  const out = await outputPage();
  await expect(out.locator('.ls-text')).toContainText('For God so loved the world');
  await control.getByRole('button', { name: 'Settings', exact: true }).click();
  await control
    .getByRole('navigation', { name: 'Settings' })
    .getByRole('button', { name: 'Screens' })
    .click();
  await control.getByRole('button', { name: 'Add look' }).click();
  // Look 1: the audience screens drop the slide (background stays).
  await control
    .getByRole('group', { name: 'Audience: layers shown in Look 1' })
    .getByRole('button', { name: 'Slide' })
    .click();
  // Esc closes Settings and nothing else: the verse stays on screen (it used to be panic too).
  await control.keyboard.press('Escape');
  await expect(out.locator('.ls-text')).toContainText('For God so loved the world');
  await control.getByRole('banner').getByRole('button', { name: 'Looks' }).click();
  await control.getByRole('menuitemradio', { name: 'Look 1' }).click();
  await expect(out.locator('.ls-text')).toHaveCount(0, { timeout: 5000 });
  await expect(out.locator('.ls-bg')).toHaveCount(1);
  await expect(control.getByRole('banner').getByRole('button', { name: 'Looks' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await control.screenshot({ path: 'test-results/30-looks.png' });
  // Back to everything on every screen.
  await control.getByRole('banner').getByRole('button', { name: 'Looks' }).click();
  await control.getByRole('menuitemradio', { name: 'Everything on every screen' }).click();
  await expect(out.locator('.ls-text')).toContainText('For God so loved the world');
});

test('announcements layer: loops over the slide, clears on its own', async () => {
  const out = await outputPage();
  await expect(out.locator('.ls-layer-content .ls-text')).toContainText('For God so loved');
  await (await servicePlan()).getByText('Welcome').first().click();
  const welcome = control.getByRole('region', { name: 'Welcome', exact: true }).first();
  await welcome.getByRole('button', { name: 'Loop on the announcements layer' }).click();
  const ann = out.locator('.ls-layer-announcements .ls-text');
  await expect(ann).toHaveCount(1, { timeout: 5000 });
  // The verse is still on its own layer underneath.
  await expect(out.locator('.ls-layer-content .ls-text')).toContainText('For God so loved');
  await expect(
    control.getByRole('button', { name: 'Clear Announcements', exact: true }),
  ).toBeEnabled();
  await control.waitForTimeout(500);
  await control.screenshot({ path: 'test-results/31-announcements-layer.png' });
  await control.getByRole('button', { name: 'Clear Announcements', exact: true }).click();
  await expect(ann).toHaveCount(0, { timeout: 5000 });
  await expect(
    welcome.getByRole('button', { name: 'Loop on the announcements layer' }),
  ).toHaveAttribute('aria-pressed', 'false');
  // Leave the verse open and live, as the next tests expect.
  await control.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K');
  await control.keyboard.type('jn 3 16');
  await expect(control.getByRole('option').first()).toContainText('John 3:16');
  await control.keyboard.press('Shift+Enter');
  // (Mid-crossfade there can briefly be two copies; the newest is last.)
  await expect(out.locator('.ls-layer-content .ls-text').last()).toContainText(
    'For God so loved the world',
  );
});

test('audio bin: play a track, a playlist plays on, fade out', async () => {
  await binTab('Audio');
  const panel = control.getByRole('region', { name: 'Show controls' });
  const audio = async () => {
    const r = await control.evaluate(() => window.lampstand.query('live.get'));
    return r.ok ? r.value.audio : null;
  };
  // A click listens on this computer first: the room hears nothing yet.
  await panel.getByRole('button', { name: 'Listen to Seed tone B' }).click();
  const preview = panel.getByRole('group', { name: 'Listening on this computer' });
  await expect(preview).toBeVisible();
  expect(await audio()).toBeNull();
  await control.screenshot({ path: 'test-results/35-audio-preview.png' });
  // "Play in room" sends it out.
  await preview.getByRole('button', { name: 'Play in room' }).click();
  await expect.poll(async () => (await audio())?.mediaId).toBe('seed-tone-b');
  await expect(preview).toBeHidden();
  await expect(panel.getByRole('button', { name: 'Pause audio' })).toBeVisible();
  // An audio playlist: A then B. Playing A moves on to B by itself.
  await panel.getByRole('button', { name: 'New audio playlist' }).click();
  await panel.getByRole('combobox', { name: 'Audio to show' }).click();
  await control.getByRole('option', { name: 'All audio' }).click();
  for (const name of ['Seed tone A', 'Seed tone B']) {
    await panel.getByRole('button', { name: `${name} options` }).click();
    await control.getByRole('menuitem', { name: 'Add to New playlist' }).click();
  }
  await panel.getByRole('combobox', { name: 'Audio to show' }).click();
  await control.getByRole('option', { name: 'New playlist' }).click();
  await panel.getByRole('button', { name: 'Play Seed tone A in the room' }).click();
  await expect.poll(async () => (await audio())?.mediaId).toBe('seed-tone-a');
  await expect.poll(async () => (await audio())?.mediaId, { timeout: 8000 }).toBe('seed-tone-b');
  await control.screenshot({ path: 'test-results/32-audio-bin.png' });
  // Fade out: it goes quiet and stops.
  await panel.getByRole('button', { name: 'Fade out and stop' }).click();
  await expect.poll(async () => await audio(), { timeout: 8000 }).toBeNull();
});

test('inputs: a camera goes live under the words; an audio input plays with a level meter', async () => {
  const out = await outputPage();
  await binTab('Media');
  await control
    .getByRole('navigation', { name: 'Media library' })
    .getByRole('button', { name: 'Video input', exact: true })
    .click();
  const bin = control.getByRole('region', { name: 'Bin' });
  const camera = bin.getByRole('button', { name: /^Put .* on Preview \(1\)$/ });
  await expect(camera).toBeVisible({ timeout: 10_000 });
  // The switcher: a click puts it on Preview; Cut takes it to the screen.
  await camera.click();
  const switcher = bin.getByRole('region', { name: 'Switcher' });
  await expect(camera).toHaveAttribute('aria-pressed', 'true');
  await switcher.getByRole('button', { name: /^Cut/ }).click();
  // The output opens the camera itself, under the slide's words.
  const feed = out.locator('.ls-layer-input > .ls-input video');
  await expect
    .poll(() => feed.evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 10_000 })
    .toBeGreaterThan(0);
  await expect(out.locator('.ls-layer-content .ls-text').last()).toContainText('For God so loved');
  // Its settings apply straight away while it's live: mirror it, fit the whole picture.
  await bin
    .getByRole('listitem')
    .getByRole('button', { name: /settings$/ })
    .first()
    .click();
  await control.getByRole('menuitemcheckbox', { name: 'Mirror' }).click();
  await control.getByRole('menuitemradio', { name: 'Fit (whole picture)' }).click();
  await control.keyboard.press('Escape');
  await expect
    .poll(() =>
      out
        .locator('.ls-layer-input video')
        .evaluate((v) => [getComputedStyle(v).transform, getComputedStyle(v).objectFit]),
    )
    .toEqual(['matrix(-1, 0, 0, 1, 0, 0)', 'contain']);
  // Saved with the app's settings (so every window, the stream and NDI agree), not per window.
  await expect
    .poll(async () => {
      const r = await control.evaluate(() => window.lampstand.query('settings.get'));
      return r.ok ? Object.values(r.value.cameras).map((c) => [c.mirror, c.fit]) : null;
    })
    .toEqual([[true, 'contain']]);
  // Picture-in-picture: the same camera in a corner box.
  await switcher.getByRole('combobox', { name: 'Picture-in-picture camera' }).click();
  await control.getByRole('option').nth(1).click();
  await expect(out.locator('.ls-pip video')).toHaveCount(1);
  await control.waitForTimeout(400);
  await control.screenshot({ path: 'test-results/33-video-input.png' });
  await switcher.getByRole('combobox', { name: 'Picture-in-picture camera' }).click();
  await control.getByRole('option', { name: 'Off', exact: true }).click();
  await expect(out.locator('.ls-pip')).toHaveCount(0);
  // Back to the defaults for the tests after this one.
  await bin
    .getByRole('listitem')
    .getByRole('button', { name: /settings$/ })
    .first()
    .click();
  await control.getByRole('menuitem', { name: 'Reset to defaults' }).click();
  // The same settings live in Settings › Video: mirroring there flips the live camera too.
  await control.getByTitle('Settings', { exact: true }).click();
  await control
    .getByRole('navigation', { name: 'Settings' })
    .getByRole('button', { name: 'Video', exact: true })
    .click();
  await expect(control.getByRole('heading', { name: 'Video', exact: true })).toBeVisible();
  await control
    .getByRole('switch', { name: /^Mirror / })
    .first()
    .click();
  await expect
    .poll(() => out.locator('.ls-layer-input video').evaluate((v) => getComputedStyle(v).transform))
    .toBe('matrix(-1, 0, 0, 1, 0, 0)');
  await control.waitForTimeout(300);
  await control.screenshot({ path: 'test-results/33-settings-video.png' });
  await control.getByRole('button', { name: 'Reset to defaults' }).first().click();
  await control.keyboard.press('Escape');
  // The camera switch (under the Live monitor while a camera is up) cuts to another, or Off.
  const cameraOnScreen = control.getByRole('combobox', { name: 'Camera on screen' }).first();
  await expect(cameraOnScreen).toBeVisible();
  await cameraOnScreen.click();
  await control.getByRole('option', { name: 'Off', exact: true }).click();
  await expect(feed).toHaveCount(0);
  // Scenes for the screens, under the monitor (the same strip as the stream's): a camera behind
  // the slide's words with a lower third, in one click, then back to the slides.
  const screenScenes = control.getByRole('group', { name: 'Scene: what the screens show' });
  await screenScenes.getByRole('radio', { name: 'Cameras' }).click();
  await screenScenes
    .getByRole('button', { name: / \+ words$/ })
    .first()
    .click();
  await expect
    .poll(() => feed.evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 10_000 })
    .toBeGreaterThan(0);
  await expect
    .poll(async () => {
      const r = await control.evaluate(() => window.lampstand.query('live.get'));
      return r.ok ? !!r.value.lowerThird : null;
    })
    .toBe(true);
  await expect(screenScenes.getByRole('button', { name: / \+ words$/ }).first()).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await control.waitForTimeout(400);
  await control.screenshot({ path: 'test-results/33-screen-scenes.png' });
  await screenScenes.getByRole('radio', { name: 'Slides' }).click();
  await screenScenes.getByRole('button', { name: 'Slides', exact: true }).click();
  await expect(feed).toHaveCount(0);
  await expect
    .poll(async () => {
      const r = await control.evaluate(() => window.lampstand.query('live.get'));
      return r.ok ? !!r.value.lowerThird : null;
    })
    .toBe(false);

  // Audio inputs, in the Audio tab: a level meter that moves, and where each one goes.
  await binTab('Audio');
  const panel = control.getByRole('region', { name: 'Audio inputs' });
  const meter = panel.getByRole('meter').first();
  await expect
    .poll(async () => Number(await meter.getAttribute('aria-valuenow')), { timeout: 10_000 })
    .toBeGreaterThan(0);
  // To the stream: it becomes a channel on the mixer that the stream hears, and the room doesn't
  // (the desk already puts it in the room).
  await panel
    .getByRole('button', { name: /^Send .* to the stream$/ })
    .first()
    .click();
  const channel = async () => {
    const r = await control.evaluate(() => window.lampstand.query('live.get'));
    return r.ok ? (r.value.mixer.channels.find((c) => c.kind === 'input') ?? null) : null;
  };
  await expect.poll(async () => (await channel())?.stream).toBe(true);
  expect((await channel())?.room).toBe(false);
  // The room as well, and off again.
  const room = panel.getByRole('button', { name: /^Play .* through the room$/ }).first();
  await room.click();
  await expect.poll(async () => (await channel())?.room).toBe(true);
  await room.click();
  await expect.poll(async () => (await channel())?.room).toBe(false);
  // The same inputs are a source in the media sidebar, across the full width.
  await control
    .getByRole('navigation', { name: 'Media library' })
    .getByRole('button', { name: 'Audio input', exact: true })
    .click();
  await expect(
    control.getByRole('region', { name: 'Bin' }).getByRole('region', { name: 'Audio inputs' }),
  ).toBeVisible();
});

test('mixer: a desk along the bottom; faders, mute and routing change the live mix', async () => {
  const live = async () => {
    const r = await control.evaluate(() => window.lampstand.query('live.get'));
    if (!r.ok) throw new Error('live.get');
    return r.value.mixer;
  };
  await control.getByRole('button', { name: 'Show or hide the mixer' }).click();
  const mixer = control.getByRole('region', { name: 'Mixer' });
  await expect(mixer).toBeVisible();
  const tracks = mixer.getByRole('region', { name: 'Tracks', exact: true });
  // Keys move a fader in dB; the room hears it.
  const fader = tracks.getByRole('slider', { name: 'Tracks level' });
  await fader.focus();
  await control.keyboard.press('Shift+ArrowDown');
  await expect
    .poll(async () => (await live()).channels.find((c) => c.id === 'tracks')?.gainDb)
    .toBe(-6);
  await tracks.getByRole('button', { name: 'Mute Tracks' }).click();
  await tracks.getByRole('button', { name: 'Send Tracks to the stream' }).click();
  await expect
    .poll(async () => {
      const c = (await live()).channels.find((x) => x.id === 'tracks');
      return [c?.mute, c?.stream];
    })
    .toEqual([true, false]);
  // The channel editor: EQ and the compressor.
  await tracks.getByRole('button', { name: 'Edit Tracks' }).click();
  const editor = mixer.getByRole('complementary', { name: 'Tracks settings' });
  await editor.getByRole('switch', { name: /cut rumble/ }).click();
  await editor.getByRole('switch', { name: 'Tracks compressor' }).click();
  await expect
    .poll(async () => {
      const c = (await live()).channels.find((x) => x.id === 'tracks');
      return [c?.hpf, c?.comp.on];
    })
    .toEqual([true, true]);
  await expect(mixer.getByRole('meter', { name: 'Room meter' })).toBeVisible();
  await control.waitForTimeout(300);
  await control.screenshot({ path: 'test-results/40-mixer.png' });
  // Back to how it was, for the tests after this one.
  await control.evaluate(async () => {
    await window.lampstand.command({ type: 'live.mixer', payload: { action: 'reset' } });
    await window.lampstand.command({
      type: 'live.mixer',
      payload: { action: 'channel', id: 'tracks', patch: { stream: true } },
    });
  });
  await expect
    .poll(async () => (await live()).channels.find((c) => c.id === 'tracks')?.gainDb)
    .toBe(0);
  await mixer.getByRole('button', { name: 'Close the mixer' }).click();
  await expect(mixer).toHaveCount(0);
});

test('NDI: feeds in Settings, and a clear way to get the runtime when it is missing', async () => {
  await control.getByRole('button', { name: 'Settings', exact: true }).click();
  const nav = control.getByRole('navigation', { name: 'Settings' });
  await nav.getByRole('button', { name: 'NDI' }).click();
  await expect(control.getByRole('heading', { name: 'NDI', exact: true })).toBeVisible();
  const ready = await control.evaluate(async () => {
    const r = await window.lampstand.query('ndi.status');
    return r.ok && r.value.available;
  });
  if (!ready) await expect(control.getByRole('button', { name: 'Get NDI Tools' })).toBeVisible();
  const feeds = control.locator('section[data-section="Feeds"]');
  await feeds.getByRole('button', { name: 'Words (alpha)' }).click();
  const feed = control.getByRole('region', { name: 'Lampstand (Words (alpha))' });
  await expect(feed).toBeVisible();
  await expect(feed.getByRole('radio', { name: 'Words (alpha)' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await control.waitForTimeout(300);
  await control.screenshot({ path: 'test-results/41-settings-ndi.png' });
  await feed.getByRole('button', { name: /^Remove / }).click();
  await expect(feed).toHaveCount(0);
  await control.keyboard.press('Escape');
});

test('stock media: a motion background goes live; a countdown joins the playlist', async () => {
  await binTab('Media');
  await control
    .getByRole('navigation', { name: 'Media library' })
    .getByRole('button', { name: 'Stock media', exact: true })
    .click();
  const bin = control.getByRole('region', { name: 'Bin' });
  // Everything is reachable: the list scrolls inside the bin.
  const list = bin.locator('.overflow-y-auto').first();
  await expect.poll(() => list.evaluate((el) => el.scrollHeight > el.clientHeight + 10)).toBe(true);
  await list.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await bin.getByRole('radio', { name: 'Worship' }).click();
  await bin.getByRole('button', { name: 'Glory', exact: true }).click();
  const bg = async () => {
    const r = await control.evaluate(() => window.lampstand.query('live.get'));
    const ref = r.ok ? r.value.program.background?.ref : undefined;
    return ref?.kind === 'generated' ? ref.colors[0] : null;
  };
  await expect.poll(bg).toBe('#FFE7B0');
  await control.screenshot({ path: 'test-results/34-stock-media.png' });
  const items = async () => await (await servicePlan()).getByRole('listitem').count();
  const before = await items();
  await bin.getByRole('radio', { name: 'Countdowns' }).click();
  await bin.getByRole('button', { name: '5 minutes', exact: true }).first().click();
  await expect(control.getByText('Added a 5-minute countdown to the playlist.')).toBeVisible();
  await expect.poll(items).toBe(before + 1);
  // Leave the verse open and live, as the next tests expect.
  await control.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K');
  await control.keyboard.type('jn 3 16');
  await expect(control.getByRole('option').first()).toContainText('John 3:16');
  await control.keyboard.press('Shift+Enter');
});

test("slide backgrounds: a stock background behind an item's slides, from the tile or the item", async () => {
  const showVerse = async (): Promise<void> => {
    await control.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K');
    await control.keyboard.type('jn 3 16');
    await expect(control.getByRole('option').first()).toContainText('John 3:16');
    await control.keyboard.press('Shift+Enter');
  };
  const bg = async () => {
    const r = await control.evaluate(() => window.lampstand.query('live.get'));
    const ref = r.ok ? r.value.program.background?.ref : undefined;
    return ref?.kind === 'generated' ? ref.colors[0] : null;
  };
  await showVerse();
  await binTab('Media');
  await control
    .getByRole('navigation', { name: 'Media library' })
    .getByRole('button', { name: 'Stock media', exact: true })
    .click();
  const bin = control.getByRole('region', { name: 'Bin' });
  await bin.getByRole('radio', { name: 'Worship' }).click();
  // From a stock tile's menu: behind the verse's slides (live now, so the screen follows).
  await bin.getByRole('button', { name: 'Throne room', exact: true }).hover();
  await bin.getByRole('button', { name: 'Throne room options' }).click();
  await control.getByRole('menuitem', { name: /^Use behind “/ }).click();
  await expect.poll(bg).toBe('#F2D27A');
  // From the item's own Background button: another stock background, then the theme's again.
  const pickBg = control.getByRole('button', { name: 'Background for these slides' }).first();
  await pickBg.click();
  await control.getByRole('menuitem', { name: 'Motion backgrounds' }).click();
  await control.getByRole('menuitem', { name: 'Glory', exact: true }).click();
  await expect.poll(bg).toBe('#FFE7B0');
  await control.screenshot({ path: 'test-results/35-slide-background.png' });
  await pickBg.click();
  // Back to the theme's background: the screen follows at once.
  await control.getByRole('menuitem', { name: 'The theme’s background' }).click();
  await expect.poll(bg).not.toBe('#FFE7B0');
  // "Every item": the whole service gets it at once; then all back to their themes.
  await bin.getByRole('button', { name: 'Majesty', exact: true }).hover();
  await bin.getByRole('button', { name: 'Majesty options' }).click();
  await control.getByRole('menuitem', { name: /^Use behind every item/ }).click();
  await expect.poll(bg).toBe('#4B1D8F');
  await pickBg.click();
  await control.getByRole('menuitem', { name: 'The theme’s background' }).click();
  await pickBg.click();
  await control.getByRole('menuitem', { name: /^Use this for all/ }).click();
  await expect.poll(bg).not.toBe('#4B1D8F');
  // A video of yours behind the words starts silent; the speaker on the live monitor turns its
  // sound on (kept with the item's background) and off again.
  await pickBg.click();
  await control.getByRole('menuitem', { name: 'Your pictures and videos' }).click();
  await control.getByRole('menuitem', { name: 'Seed clip', exact: true }).click();
  const sound = async () => {
    const r = await control.evaluate(() => window.lampstand.query('live.get'));
    const ref = r.ok ? r.value.program.background?.ref : undefined;
    return ref?.kind === 'video' ? !!ref.sound : null;
  };
  await expect.poll(sound).toBe(false);
  await control.getByRole('button', { name: /^The background video is silent/ }).click();
  await expect.poll(sound).toBe(true);
  await control.waitForTimeout(300);
  await control.screenshot({ path: 'test-results/35b-background-sound.png' });
  await pickBg.click();
  await expect(
    control.getByRole('menuitemcheckbox', { name: 'Play the video’s sound' }),
  ).toHaveAttribute('aria-checked', 'true');
  await control.keyboard.press('Escape');
  await control.getByRole('button', { name: /^The background video’s sound is on/ }).click();
  await expect.poll(sound).toBe(false);
  await pickBg.click();
  await control.getByRole('menuitem', { name: 'The theme’s background' }).click();
  // Room / Next over the monitor: the next slide shows there, the screens don't change.
  const view = control.getByRole('radiogroup', { name: 'What the monitor shows' });
  await view.getByRole('radio', { name: 'Next' }).click();
  await expect(control.getByRole('img', { name: 'Next slide' })).toBeVisible();
  await expect(control.getByRole('status').filter({ hasText: 'Next slide' })).toBeVisible();
  await view.getByRole('radio', { name: 'Room' }).click();
  await expect(control.getByRole('img', { name: 'Next slide' })).toHaveCount(0);
});

test('Easy view shows a picture for slides without words; Settings › Audio', async () => {
  await binTab('Media');
  const bin = control.getByRole('region', { name: 'Bin' });
  await control
    .getByRole('navigation', { name: 'Media library' })
    .getByRole('button', { name: 'All media', exact: true })
    .click();
  await bin.getByRole('button', { name: 'Seed image', exact: true }).click();
  await control.getByRole('radio', { name: 'Easy' }).first().click();
  const list = control.getByRole('list', { name: 'Slide list' });
  await expect(list.locator('.ls-layer-media').first()).toBeAttached();
  await control.screenshot({ path: 'test-results/36-easy-media.png' });
  await control.getByRole('radio', { name: 'Grid' }).first().click();
  // Settings › Audio: where the room hears it, fades, listening first, inputs with meters.
  await control.getByTitle('Settings', { exact: true }).click();
  await control
    .getByRole('navigation', { name: 'Settings' })
    .getByRole('button', { name: 'Audio', exact: true })
    .click();
  await expect(control.getByRole('heading', { name: 'Audio', exact: true })).toBeVisible();
  await expect(control.getByRole('combobox', { name: 'Plays through' })).toBeVisible();
  await expect(control.getByRole('slider', { name: 'Fade out takes' })).toHaveAttribute(
    'aria-valuetext',
    '3 s',
  );
  await expect(control.getByRole('meter').first()).toBeAttached();
  await control.waitForTimeout(300);
  await control.screenshot({ path: 'test-results/37-settings-audio.png' });
  await control.keyboard.press('Escape');
  // Leave the verse open and live, as the next tests expect.
  await control.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K');
  await control.keyboard.type('jn 3 16');
  await expect(control.getByRole('option').first()).toContainText('John 3:16');
  await control.keyboard.press('Shift+Enter');
});

test('media playlists: create, drag media in, open, rename and delete', async () => {
  await binTab('Media');
  const bin = control.getByRole('region', { name: 'Bin' });
  // The media sidebar (library views, playlists) sits in the left column, beside the bin.
  const nav = control.getByRole('navigation', { name: 'Media library' });
  // Media is grouped by month, newest first, with the pictures and videos counted.
  await expect(bin.getByRole('heading', { level: 3 }).first()).toBeVisible();
  await nav.getByRole('button', { name: 'New media playlist' }).click();
  const row = nav.getByRole('button', { name: 'New playlist', exact: true });
  await expect(row).toHaveAttribute('aria-pressed', 'true');
  await expect(bin.getByText(/This playlist is empty/)).toBeVisible();
  // Drag a clip from All media onto the playlist in the sidebar.
  await nav.getByRole('button', { name: 'All media', exact: true }).click();
  await bin.getByRole('button', { name: 'Seed clip', exact: true }).dragTo(row);
  await row.click();
  await expect(row).toHaveAttribute('aria-pressed', 'true');
  await expect(nav.getByRole('button', { name: 'All media', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(bin.getByRole('button', { name: 'Seed clip', exact: true })).toBeVisible();
  await expect(bin.getByRole('button', { name: 'Seed image', exact: true })).toHaveCount(0);
  await control.waitForTimeout(400);
  await control.screenshot({ path: 'test-results/25-media-playlist.png' });
  // Rename from its menu, then delete it: the media stays in the library.
  await nav.getByRole('button', { name: 'New playlist options' }).click();
  await control.getByRole('menuitem', { name: 'Rename' }).click();
  await nav.getByRole('textbox', { name: 'Rename' }).fill('Walk-in loops');
  await control.keyboard.press('Enter');
  const renamed = nav.getByRole('button', { name: 'Walk-in loops', exact: true });
  await expect(renamed).toBeVisible();
  await nav.getByRole('button', { name: 'Walk-in loops options' }).click();
  await control.getByRole('menuitem', { name: 'Delete playlist' }).click();
  await expect(renamed).toHaveCount(0);
  await nav.getByRole('button', { name: 'All media', exact: true }).click();
  await expect(bin.getByRole('button', { name: 'Seed clip', exact: true })).toBeVisible();
});

test('media bin: hover outline, list view, sort and rename', async () => {
  await binTab('Media');
  const bin = control.getByRole('region', { name: 'Bin' });
  const nav = control.getByRole('navigation', { name: 'Media library' });
  await nav.getByRole('button', { name: 'All media', exact: true }).click();
  // Hover outlines a tile without moving it.
  const tile = bin.getByRole('button', { name: 'Seed clip', exact: true });
  await tile.scrollIntoViewIfNeeded();
  const before = await tile.boundingBox();
  await tile.hover();
  await control.waitForTimeout(200);
  expect(await tile.boundingBox()).toEqual(before);
  // Only the seeded media (earlier tests add more).
  await bin.getByRole('searchbox', { name: 'Search media' }).fill('Seed');
  // Sort by name, A to Z: the clip comes before the image.
  await bin.getByRole('button', { name: /^Sort by/ }).click();
  await control.getByRole('menuitemradio', { name: 'Name' }).click();
  await expect(bin.getByRole('button', { name: 'Sort by Name' })).toBeVisible();
  // List view: a row per piece of media, with sortable columns.
  await bin.getByRole('radio', { name: 'List' }).click();
  const rows = bin.getByRole('list', { name: 'All media' }).getByRole('listitem');
  await expect(rows.first()).toContainText('Seed clip');
  await expect(rows.first()).toContainText('Video');
  await control.screenshot({ path: 'test-results/26-media-list.png' });
  // Click the Name heading again: Z to A.
  await bin.getByRole('button', { name: 'Sort by Name' }).last().click();
  await expect(rows.last()).toContainText('Seed clip');
  // Rename from the row's menu, inline.
  await bin.getByRole('button', { name: 'Seed image options' }).click();
  await control.getByRole('menuitem', { name: 'Rename' }).click();
  const field = bin.getByRole('textbox', { name: 'Rename Seed image' });
  await field.fill('Seed welcome');
  await field.press('Enter');
  await expect(bin.getByRole('button', { name: 'Seed welcome', exact: true })).toBeVisible();
  // Esc cancels a rename.
  await bin.getByRole('button', { name: 'Seed welcome options' }).click();
  await control.getByRole('menuitem', { name: 'Rename' }).click();
  await bin.getByRole('textbox', { name: 'Rename Seed welcome' }).fill('Oops');
  await control.keyboard.press('Escape');
  await expect(bin.getByRole('button', { name: 'Seed welcome', exact: true })).toBeVisible();
  // Back to the grid, newest first, under the old name.
  await bin.getByRole('button', { name: 'Seed welcome options' }).click();
  await control.getByRole('menuitem', { name: 'Rename' }).click();
  await bin.getByRole('textbox', { name: 'Rename Seed welcome' }).fill('Seed image');
  await control.keyboard.press('Enter');
  await expect(bin.getByRole('button', { name: 'Seed image', exact: true })).toBeVisible();
  await bin.getByRole('radio', { name: 'Grid' }).click();
  await bin.getByRole('button', { name: /^Sort by/ }).click();
  const byDate = control.getByRole('menuitemradio', { name: 'Date added' });
  await expect(byDate).toBeVisible();
  await byDate.click();
  await expect(bin.getByRole('heading', { level: 3 }).first()).toBeVisible();
  await control.screenshot({ path: 'test-results/27-media-grid.png' });
  await bin.getByRole('searchbox', { name: 'Search media' }).fill('');
});

test('layer strip: drag a layer to move it, tuck it into "…", put it back', async () => {
  const strip = control.getByRole('group', { name: 'Clear', exact: true });
  const names = async (): Promise<string[]> =>
    (
      await strip
        .getByRole('button')
        .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''))
    ).map((n) => n.replace(/^(Clear|Bring back) /, '').replace(/ \(.*$/, ''));
  const order = await names();
  expect(order).not.toContain('Props');
  const at = (label: string) =>
    strip.locator(
      `button[aria-label^="Clear ${label}"], button[aria-label^="Bring back ${label}"]`,
    );
  // Drag Background above Messages.
  await at('Background').dragTo(at('Messages'));
  await expect
    .poll(async () => (await names()).indexOf('Background'))
    .toBeLessThan((await names()).indexOf('Messages'));
  // Drop Announcements onto "…": it leaves the strip and appears in the menu.
  await at('Announcements').dragTo(strip.getByRole('button', { name: 'More layers' }));
  await expect(at('Announcements')).toHaveCount(0);
  await strip.getByRole('button', { name: 'More layers' }).click();
  await expect(control.getByRole('menuitem', { name: /Announcements/ })).toBeVisible();
  // Put Props on the strip from the menu, then reset everything.
  await control.getByRole('menuitemcheckbox', { name: 'Props' }).click();
  await control.keyboard.press('Escape');
  await expect(at('Props')).toHaveCount(1);
  await control.screenshot({ path: 'test-results/29-layer-strip.png' });
  await strip.getByRole('button', { name: 'More layers' }).click();
  await control.getByRole('menuitem', { name: 'Reset the strip' }).click();
  await expect.poll(names).toEqual(order);
});

test('stage layouts: pick a ready-made one, design your own, switch from the Stage menu', async () => {
  await outputPage();
  const stage = app.windows().find((w) => w.url().includes('/stage/'))!;
  await mode('Stage');
  const list = control.getByRole('complementary', { name: 'Stage layouts' });
  await expect(list.getByRole('button', { name: /Classic/ })).toContainText('On stage');
  // Big clock on the stage screens: the clock shows, the slide renders don't.
  await list.getByRole('button', { name: /Big clock/ }).click();
  await control.getByRole('button', { name: 'Use on stage screens' }).click();
  await expect(stage.locator('.ls-st-clock')).toBeVisible();
  await expect(stage.locator('.ls-st-current')).toHaveCount(0);
  // Your own: duplicate it, add a line of text, use it.
  await control.getByRole('button', { name: 'Duplicate to edit' }).click();
  await expect(control.getByRole('textbox', { name: 'Layout name' })).toHaveValue('Big clock copy');
  const elements = control.getByRole('complementary', { name: 'Elements' });
  await elements.getByRole('button', { name: 'Text', exact: true }).click();
  const field = elements.getByRole('textbox', { name: 'What it says' });
  await field.fill('Pray for the band');
  await field.press('Enter');
  await control.getByRole('button', { name: 'Use on stage screens' }).click();
  await expect(stage.locator('.ls-st-text')).toContainText('Pray for the band');
  // Drag the text box: it moves on the stage screen too.
  const box = control.getByRole('button', { name: 'Text box' });
  const before = await stage.locator('.ls-st-text').evaluate((e) => (e as HTMLElement).style.left);
  const b = (await box.boundingBox())!;
  await control.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await control.mouse.down();
  await control.mouse.move(b.x + b.width / 2 - 80, b.y + b.height / 2 - 40, { steps: 6 });
  await control.mouse.up();
  await expect
    .poll(() => stage.locator('.ls-st-text').evaluate((e) => (e as HTMLElement).style.left))
    .not.toBe(before);
  await control.screenshot({ path: 'test-results/38-stage-layouts.png' });
  // The Stage menu in the toolbar switches layouts too: back to Classic.
  await control.getByRole('button', { name: /^Stage:/ }).click();
  await control.getByRole('menuitemradio', { name: 'Classic' }).click();
  await control.keyboard.press('Escape');
  await expect(stage.locator('.ls-st-current')).toHaveCount(1);
  // Nothing to say: the message box stays out of sight (it used to show as an empty bar).
  await expect(stage.locator('.ls-st-message')).toBeHidden();
  await mode('Show');
});

test('video countdown: a video timed to end on zero, made from the media bin', async () => {
  const out = await outputPage();
  await binTab('Media');
  const bin = control.getByRole('region', { name: 'Bin' });
  await control
    .getByRole('navigation', { name: 'Media library' })
    .getByRole('button', { name: 'All media', exact: true })
    .click();
  await bin.getByRole('button', { name: 'Seed clip', exact: true }).hover();
  await bin.getByRole('button', { name: 'Seed clip options' }).click();
  await control.getByRole('menuitem', { name: 'Make a countdown with it' }).click();
  // It opens for editing, with the clip chosen and the numbers hidden (the video has its own).
  await expect(control.getByRole('combobox', { name: 'Countdown video' })).toContainText(
    'Seed clip',
  );
  await expect(
    control.getByRole('switch', { name: 'Show the numbers over the video' }),
  ).toHaveAttribute('aria-checked', 'false');
  await control.screenshot({ path: 'test-results/39-video-countdown.png' });
  // Live: the 6 s clip waits on its first frame until 6 s before zero (a minute away).
  await mode('Show');
  await control.keyboard.press('Space');
  await expect(out.locator('.ls-layer-media video')).toHaveCount(1);
  const media = async () => {
    const r = await control.evaluate(() => window.lampstand.query('live.get'));
    return r.ok ? r.value.program.media : null;
  };
  await expect.poll(async () => (await media())?.mediaId).toBe('seed-clip');
  const m = await media();
  expect(Date.parse(m!.syncedAt!) - Date.now()).toBeGreaterThan(40_000);
  await expect
    .poll(() => out.locator('.ls-layer-media video').evaluate((v: HTMLVideoElement) => v.paused))
    .toBe(true);
  await expect(out.locator('.ls-countdown')).toHaveCount(0);
  // Take it out of the service again (one undo), and put the verse back for the next tests.
  await control.keyboard.press(process.platform === 'darwin' ? 'Meta+Z' : 'Control+Z');
  await control.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K');
  await control.keyboard.type('jn 3 16');
  await expect(control.getByRole('option').first()).toContainText('John 3:16');
  await control.keyboard.press('Shift+Enter');
});

test('recording: Lampstand records the stream picture and sound to a file', async () => {
  const cmd = (type: string, payload: unknown) =>
    control.evaluate(([t, p]) => window.lampstand.command({ type: t, payload: p }), [
      type,
      payload,
    ] as const);
  const status = () =>
    control.evaluate(async () => {
      const r = await window.lampstand.query('stream.status');
      return r.ok ? r.value : null;
    });
  // Something on screen, so the recording has a picture (the stream draws the program).
  await control.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K');
  await control.keyboard.type('jn 3 16');
  await expect(control.getByRole('option').first()).toContainText('John 3:16');
  await control.keyboard.press('Shift+Enter');
  // A looping track too, so the recording has real sound (checked below).
  await cmd('live.audio', { action: 'play', mediaId: 'seed-tone-b', loop: true });
  await cmd('stream.start', { record: true });
  await expect.poll(async () => (await status())?.state, { timeout: 15_000 }).toBe('live');
  // The room hears it too: the Room mix's meter moves (it reads the main output's real mix).
  await control.getByRole('button', { name: 'Show or hide the mixer' }).click();
  const roomMeter = control
    .getByRole('region', { name: 'Mixer' })
    .getByRole('meter', { name: 'Room meter' });
  await expect
    .poll(async () => Number(await roomMeter.getAttribute('aria-valuenow')), { timeout: 10_000 })
    .toBeGreaterThan(-50);
  await control.getByRole('button', { name: 'Close the mixer' }).click();
  await control.waitForTimeout(3_000);
  const s = await status();
  expect(s?.recording).toBe(true);
  expect(s?.fps).toBeGreaterThan(10);
  await cmd('stream.stop', { record: true });
  await expect.poll(async () => (await status())?.state).toBe('idle');
  const folder = join(dir, 'recordings');
  const [file] = readdirSync(folder).filter((f) => f.endsWith('.mp4'));
  expect(file).toMatch(/^Lampstand \d{4}-\d\d-\d\d \d\d-\d\d\.mp4$/);
  const path = join(folder, file!);
  expect(statSync(path).size).toBeGreaterThan(5_000);
  const probe = execFileSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', path],
    {
      encoding: 'utf8',
    },
  );
  expect(probe).toContain('h264');
  expect(probe).toContain('aac');
  const duration = Number(
    execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
      {
        encoding: 'utf8',
      },
    ),
  );
  expect(duration).toBeGreaterThan(2.5);
  // A frame from the middle isn't black: the slide was drawn into the stream.
  const gray = execFileSync('ffmpeg', [
    '-v',
    'error',
    '-ss',
    '2',
    '-i',
    path,
    '-frames:v',
    '1',
    '-vf',
    'scale=64:36',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'gray',
    '-',
  ]);
  const mean = gray.reduce((a, b) => a + b, 0) / gray.length;
  expect(mean).toBeGreaterThan(8);
  // And it isn't silent: the track's sound went through the stream mix into the file. (It used
  // to be pure silence: the sound tap and the media's sound were both blocked.)
  const volume = spawnSync(
    'ffmpeg',
    ['-v', 'info', '-i', path, '-af', 'volumedetect', '-vn', '-f', 'null', '-'],
    { encoding: 'utf8' },
  ).stderr;
  const meanDb = Number(/mean_volume: ([-\d.]+) dB/.exec(volume)?.[1] ?? -99);
  expect(meanDb).toBeGreaterThan(-45);
  await cmd('live.audio', { action: 'stop' });
});

test('livestream: set up a destination, go live from the Live console, end it', async () => {
  // A local RTMP server stands in for YouTube: it saves what it receives.
  const got = join(dir, 'got.flv');
  const server = spawn('ffmpeg', [
    '-v',
    'error',
    '-listen',
    '1',
    '-i',
    'rtmp://127.0.0.1:19350/live/test',
    '-c',
    'copy',
    '-y',
    got,
  ]);
  // What the stand-in server says, to explain a stream it never received.
  let serverLog = '';
  server.stderr.on('data', (d: Buffer) => (serverLog += d.toString()));
  await control.waitForTimeout(800);
  // Settings › Streaming: add a custom RTMP destination.
  await control.getByTitle('Settings', { exact: true }).click();
  await control
    .getByRole('navigation', { name: 'Settings' })
    .getByRole('button', { name: 'Streaming' })
    .click();
  await expect(control.getByRole('heading', { name: 'Streaming', exact: true })).toBeVisible();
  await control.getByRole('button', { name: 'Custom RTMP', exact: true }).click();
  const url = control.getByRole('textbox', { name: 'Server address (RTMP)' });
  await url.fill('rtmp://127.0.0.1:19350/live/test');
  await url.press('Tab');
  // The key field never shows a saved key back.
  const key = control.getByLabel(/^Stream key for/);
  await expect(key).toHaveAttribute('type', 'password');
  await control.waitForTimeout(600);
  await control.screenshot({ path: 'test-results/40-settings-streaming.png' });
  await control.keyboard.press('Escape');
  // The Live console, docked beside the output: the real stream picture shows before going
  // live (the stream window is ready, nothing is encoding yet).
  await control.getByRole('button', { name: 'Livestream and recording' }).click();
  const live = control.getByRole('region', { name: 'Live', exact: true });
  await expect(live).toBeVisible();
  await expect(live.getByRole('img', { name: 'What the stream shows' })).toBeVisible({
    timeout: 15_000,
  });
  const stream = () =>
    control.evaluate(async () => {
      const r = await window.lampstand.query('stream.status');
      return r.ok ? r.value : null;
    });
  expect((await stream())?.state).toBe('idle');
  expect((await stream())?.ready).toBe(true);
  // Before going live, the mics already show on the stream's meter (to check they work).
  const left = live.getByRole('meter', { name: 'Stream sound, left' });
  await expect
    .poll(async () => Number(await left.getAttribute('aria-valuenow')), { timeout: 15_000 })
    .toBeGreaterThan(-60);
  // Go live (confirmed): the destination goes live, and the health panel fills in.
  await live.getByRole('button', { name: 'Go live' }).click();
  await answer('Go live');
  await expect(live.getByRole('status')).toHaveText(/Live/, { timeout: 20_000 });
  await expect(live.getByText('Frame rate')).toBeVisible();
  await expect(live.getByRole('group', { name: 'Stream readouts' })).toContainText(/\d+ fps/);
  await expect
    .poll(async () => (await stream())?.health?.history.fps.length ?? 0, { timeout: 10_000 })
    .toBeGreaterThan(1);
  await control.waitForTimeout(1_500);
  await control.screenshot({ path: 'test-results/41-live-console.png' });
  // The stream's sound shows over its picture, left and right.
  await expect(live.getByRole('group', { name: "The stream's sound" })).toBeVisible();
  // A scene sets what the stream shows in one click.
  const picture = async () => {
    const r = await control.evaluate(() => window.lampstand.query('settings.get'));
    return r.ok ? `${r.value.stream.picture.background} ${r.value.stream.picture.words}` : '';
  };
  const scenes = live.getByRole('group', { name: 'Scene: what the stream shows' });
  await scenes.getByRole('button', { name: 'Words on black' }).click();
  await expect.poll(picture).toBe('black full');
  await expect(scenes.getByRole('button', { name: 'Words on black' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await scenes.getByRole('button', { name: 'Slides + lower third' }).click();
  await expect.poll(picture).toBe('program lowerThird');
  // The switcher's program, and mirroring a screen (the stage display), are scenes too.
  const mirror = async () => {
    const r = await control.evaluate(() => window.lampstand.query('settings.get'));
    return r.ok ? r.value.stream.picture.mirror : '';
  };
  await scenes.getByRole('radio', { name: 'Cameras' }).click();
  await scenes.getByRole('button', { name: 'Switcher', exact: true }).click();
  await expect.poll(picture).toBe('switcher none');
  // Send to stream (on the live monitor): the screens go on the stream; again, it goes back.
  const sendToStream = control.getByRole('button', { name: 'Send to stream' });
  await sendToStream.click();
  await expect.poll(picture).toBe('program full');
  await control.getByRole('button', { name: 'On stream · Undo' }).click();
  await expect.poll(picture).toBe('switcher none');
  // Cover: the stream shows the cover picture until shown again.
  const covered = async () => (await stream())?.covered;
  await live.getByRole('button', { name: 'Cover', exact: true }).click();
  await expect.poll(covered).toBe(true);
  await control.waitForTimeout(600);
  await control.screenshot({ path: 'test-results/41f-live-covered.png' });
  await live.getByRole('button', { name: 'Uncover' }).click();
  await expect.poll(covered).toBe(false);
  await scenes.getByRole('radio', { name: 'Screens' }).click();
  await scenes.getByRole('button', { name: 'Stage display' }).click();
  await expect.poll(mirror).toBe('stage');
  await control.waitForTimeout(800);
  await control.screenshot({ path: 'test-results/41c-live-scenes.png' });
  await scenes.getByRole('radio', { name: 'Slides' }).click();
  await scenes.getByRole('button', { name: 'Slides + lower third' }).click();
  await expect.poll(mirror).toBe('own');
  await expect.poll(picture).toBe('program lowerThird');
  // The scenes fold away (and come back) with the arrow beside them.
  // Folded, the strip keeps only its header (the tiles go).
  await live.getByRole('button', { name: 'Hide the scenes' }).click();
  await expect(scenes.getByRole('button', { name: 'Slides + lower third' })).toBeHidden();
  await live.getByRole('button', { name: 'Show the scenes' }).click();
  await expect(scenes.getByRole('button', { name: 'Slides + lower third' })).toBeVisible();
  // A muted stream is called out (viewers would hear nothing), and Unmute fixes it.
  await live.getByRole('button', { name: 'Mute Stream' }).click();
  const silent = live.getByRole('alert').filter({ hasText: 'The stream is muted' });
  await expect(silent).toBeVisible({ timeout: 20_000 });
  await control.screenshot({ path: 'test-results/41b-live-silent.png' });
  await silent.getByRole('button', { name: 'Unmute' }).click();
  await expect
    .poll(async () => {
      const r = await control.evaluate(() => window.lampstand.query('live.get'));
      return r.ok ? r.value.mixer.stream.mute : null;
    })
    .toBe(false);
  // Turned right down, the levels are named as the reason, and one click puts them back.
  const streamGain = async () => {
    const r = await control.evaluate(() => window.lampstand.query('live.get'));
    return r.ok ? r.value.mixer.stream.gainDb : null;
  };
  await control.evaluate(() =>
    window.lampstand.command({
      type: 'live.mixer',
      payload: { action: 'bus', bus: 'stream', patch: { gainDb: -40 } },
    }),
  );
  await expect.poll(streamGain).toBe(-40);
  const low = live.getByRole('alert').filter({ hasText: 'turned right down' });
  await expect(low).toBeVisible({ timeout: 20_000 });
  await expect(low).toContainText('the stream −40.0 dB');
  await low.getByRole('button', { name: 'Turn up to 0 dB' }).click();
  await expect.poll(streamGain).toBe(0);
  // A second input (a sound card) on the mixer but not sent to the stream: still one mic row in
  // the console. Picking it there sends it to the stream instead of the first mic, each mic
  // keeping its own level (the first comes off the stream with its settings intact).
  const mics = await control.evaluate(async () =>
    (await navigator.mediaDevices.enumerateDevices())
      .filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default')
      .map((d) => ({ id: d.deviceId, label: d.label })),
  );
  const inputs = async () => {
    const r = await control.evaluate(() => window.lampstand.query('live.get'));
    return r.ok ? r.value.mixer.channels.filter((c) => c.kind === 'input') : [];
  };
  const firstMic = (await inputs()).find((c) => c.stream);
  const spare = mics.find((m) => m.id !== firstMic?.deviceId);
  expect(firstMic && spare).toBeTruthy(); // the test machine has two (fake) mics
  if (firstMic && spare) {
    await control.evaluate(
      (d) =>
        window.lampstand.command({
          type: 'live.mixer',
          payload: { action: 'add', deviceId: d.id, name: d.label, room: false, stream: false },
        }),
      spare,
    );
    await expect.poll(async () => (await inputs()).length).toBe(2);
    const sound = async () =>
      (await inputs()).map((c) => `${c.deviceId === spare.id ? 'spare' : 'first'}:${c.stream}`);
    const which = live.getByRole('combobox', { name: /^Which input / });
    await expect(which).toHaveCount(1);
    await which.click();
    await control.getByRole('option', { name: spare.label }).click();
    await expect.poll(sound).toEqual(['first:false', 'spare:true']);
    // The first mic kept its own input and settings; the console still has one row.
    expect((await inputs()).find((c) => c.id === firstMic.id)?.deviceId).toBe(firstMic.deviceId);
    await expect(which).toHaveCount(1);
    // And back again.
    await which.click();
    await control.getByRole('option', { name: firstMic.name }).click();
    await expect.poll(sound).toEqual(['first:true', 'spare:false']);
  }
  // The stream's lower third (Slides + lower third is on air): move it to the top left, let
  // the words spread wider, choose a size.
  const shows = live.getByRole('region', { name: 'Lower third on the stream' });
  await shows.scrollIntoViewIfNeeded();
  await shows.getByRole('radio', { name: 'Top left' }).click();
  await expect
    .poll(async () => {
      const r = await control.evaluate(() => window.lampstand.query('settings.get'));
      return r.ok ? r.value.stream.picture.wordsEdge : '';
    })
    .toBe('top');
  await shows.getByRole('slider', { name: 'Width' }).fill('95');
  await expect
    .poll(async () => {
      const r = await control.evaluate(() => window.lampstand.query('settings.get'));
      return r.ok ? r.value.stream.picture.wordsWidth : 0;
    })
    .toBe(95);
  await control.waitForTimeout(600);
  await control.screenshot({ path: 'test-results/41g-live-words-top.png' });
  await shows.getByRole('radio', { name: 'Bottom left' }).click();
  await shows.getByRole('button', { name: 'Auto', exact: true }).click();
  await expect(shows.getByRole('slider', { name: 'Size' })).toBeVisible();
  await expect
    .poll(async () => {
      const r = await control.evaluate(() => window.lampstand.query('settings.get'));
      return r.ok ? `${r.value.stream.picture.wordsAlign} ${r.value.stream.picture.wordsAuto}` : '';
    })
    .toBe('left false');
  await control.waitForTimeout(700);
  await control.screenshot({ path: 'test-results/41a-live-words.png' });
  await shows.getByRole('radio', { name: 'Bottom', exact: true }).click();
  await shows.getByRole('button', { name: 'Auto', exact: true }).click();
  // The stream's lower third in a theme made for it.
  await shows.getByRole('combobox', { name: 'Theme' }).click();
  await control.getByRole('option', { name: 'Stream lower third' }).click();
  await control.waitForTimeout(900);
  await control.screenshot({ path: 'test-results/41d-live-words-theme.png' });
  // Lower-third mode on the audience screens: the words move to the bottom in that theme.
  const lowerThird = control.getByRole('region', { name: 'Lower third on the screens' });
  await lowerThird.getByRole('switch', { name: 'Lower third on the screens' }).click();
  await lowerThird.getByRole('combobox', { name: 'Lower-third theme' }).click();
  await control.getByRole('option', { name: 'Modern lower third' }).click();
  await lowerThird.getByRole('radio', { name: 'Right' }).click();
  await expect
    .poll(async () => {
      const r = await control.evaluate(() => window.lampstand.query('live.get'));
      return r.ok ? `${r.value.lowerThird?.name} ${r.value.lowerThird?.text.align}` : null;
    })
    .toBe('Modern lower third right');
  await control.waitForTimeout(700);
  await control.screenshot({ path: 'test-results/41e-screens-lower-third.png' });
  await lowerThird.getByRole('switch', { name: 'Lower third on the screens' }).click();
  await shows.getByRole('combobox', { name: 'Theme' }).click();
  await control.getByRole('option', { name: /Each slide/ }).click();
  await live.getByRole('button', { name: 'End stream' }).click();
  await answer('End stream');
  await expect(live.getByRole('button', { name: 'Go live' })).toBeVisible({ timeout: 15_000 });
  await new Promise<void>((resolve) => {
    server.once('exit', () => resolve());
    setTimeout(() => {
      server.kill();
      resolve();
    }, 5_000);
  });
  if (!existsSync(got)) {
    const r = await control.evaluate(() => window.lampstand.query('stream.status'));
    throw new Error(
      `the server received nothing; it said: ${serverLog.slice(-800) || '(nothing)'}; destinations: ${JSON.stringify(r.ok ? r.value.destinations : null)}`,
    );
  }
  const probe = execFileSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', got],
    {
      encoding: 'utf8',
    },
  );
  expect(probe).toContain('h264');
  expect(probe).toContain('aac');
});

test('Live console: pops out into its own window, records from there, docks back', async () => {
  const live = control.getByRole('region', { name: 'Live', exact: true });
  await expect(live).toBeVisible();
  // Add a destination and its stream key right from the console.
  await live.getByRole('button', { name: 'Add', exact: true }).click();
  await control.getByRole('menuitem', { name: 'YouTube' }).click();
  const youtube = live.getByRole('listitem').filter({ hasText: 'YouTube' });
  await expect(youtube.getByText('Key needed')).toBeVisible();
  const keyField = live.getByLabel('Stream key for YouTube');
  await keyField.fill('abcd-1234-efgh-5678-ijkl');
  await keyField.press('Enter');
  await expect(youtube.getByText('Key needed')).toHaveCount(0);
  // A direct link: no key, just the receiver's address and port.
  await live.getByRole('button', { name: 'Add', exact: true }).click();
  await control.getByRole('menuitem', { name: 'Direct link' }).click();
  const direct = live.getByRole('listitem').filter({ hasText: 'Direct link' });
  await expect(direct.getByText('Address needed')).toBeVisible();
  await live.getByRole('textbox', { name: "Receiver's address" }).fill('192.168.1.50');
  await live.getByRole('textbox', { name: 'Port' }).fill('9000');
  await expect(direct.getByText('Address needed')).toHaveCount(0);
  await control.screenshot({ path: 'test-results/41b-live-destinations.png' });
  await live.getByRole('button', { name: 'Remove Direct link' }).click();
  await expect(direct).toHaveCount(0);
  // NDI has its own row, and quick settings sit under the destinations.
  await expect(live.getByRole('listitem').filter({ hasText: 'NDI' })).toBeVisible();
  await expect(live.getByRole('radiogroup', { name: 'Mode' })).toBeVisible();
  await youtube.getByRole('button', { name: /^Stream key and settings for YouTube/ }).click();
  await control.screenshot({ path: 'test-results/41c-live-key.png' });
  await live.getByRole('button', { name: 'Remove YouTube' }).click();
  await expect(youtube).toHaveCount(0);
  const opened = app.waitForEvent('window');
  await live
    .getByRole('button', { name: 'Open the Live console in its own window' })
    .first()
    .click();
  const win = await opened;
  await win.waitForLoadState('domcontentloaded');
  expect(win.url()).toContain('view=live');
  // Docked console gives way to the window.
  await expect(live).toHaveCount(0);
  const own = win.getByRole('region', { name: 'Live', exact: true });
  await expect(own).toBeVisible();
  await own.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(own.getByRole('status')).toHaveText(/Recording/, { timeout: 20_000 });
  await win.waitForTimeout(1_500);
  await win.screenshot({ path: 'test-results/42-live-window.png' });
  await own.getByRole('button', { name: 'Stop recording' }).click();
  await expect(own.getByRole('button', { name: 'Record', exact: true })).toBeVisible({
    timeout: 15_000,
  });
  // Back into the main window.
  await own.getByRole('button', { name: 'Back into the main window' }).click();
  await expect(control.getByRole('region', { name: 'Live', exact: true })).toBeVisible();
  await control.getByRole('button', { name: 'Close the Live console' }).click();
});

test('Light mode: a smaller picture for modest computers', async () => {
  const set = (performance: string) =>
    control.evaluate(async (p) => {
      const r = await window.lampstand.query('settings.get');
      if (r.ok)
        await window.lampstand.command({
          type: 'settings.update',
          payload: { patch: { stream: { ...r.value.stream, performance: p } } },
        });
    }, performance);
  const status = () =>
    control.evaluate(async () => {
      const r = await window.lampstand.query('stream.status');
      return r.ok ? r.value : null;
    });
  await set('light');
  const folder = join(dir, 'recordings');
  await control.evaluate(() =>
    window.lampstand.command({ type: 'stream.start', payload: { record: true } }),
  );
  await expect.poll(async () => (await status())?.state, { timeout: 15_000 }).toBe('live');
  expect((await status())?.profile).toMatchObject({ mode: 'light', height: 540 });
  // This computer encodes on the GPU unless an ffmpeg encoder is chosen (the fallback below).
  expect(['gpu', 'cpu']).toContain((await status())?.pipeline);
  await control.waitForTimeout(2_500);
  await control.evaluate(() =>
    window.lampstand.command({ type: 'stream.stop', payload: { record: true } }),
  );
  await expect.poll(async () => (await status())?.state).toBe('idle');
  const [file] = readdirSync(folder)
    .filter((f) => f.endsWith('.mp4'))
    .sort((a, b) => statSync(join(folder, b)).mtimeMs - statSync(join(folder, a)).mtimeMs);
  const size = execFileSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'v',
      '-show_entries',
      'stream=width,height',
      '-of',
      'csv=p=0',
      join(folder, file!),
    ],
    { encoding: 'utf8' },
  ).trim();
  expect(size).toBe('960,540');
  await set('auto');
});

test('the encoder restarts cleanly if it stops mid-recording', async () => {
  const status = () =>
    control.evaluate(async () => {
      const r = await window.lampstand.query('stream.status');
      return r.ok ? r.value : null;
    });
  await control.evaluate(() =>
    window.lampstand.command({ type: 'stream.start', payload: { record: true } }),
  );
  await expect.poll(async () => (await status())?.state, { timeout: 15_000 }).toBe('live');
  // The encoder dies (as when a connection drops): Lampstand starts it again by itself, and
  // the new one gets a fresh stream from a keyframe (it used to get leftovers and quit).
  execFileSync('pkill', ['-f', `ffmpeg.*pipe:0.*${dir.split('/').pop() ?? ''}`]);
  await expect.poll(async () => (await status())?.restarts, { timeout: 10_000 }).toBe(1);
  await expect.poll(async () => (await status())?.state, { timeout: 20_000 }).toBe('live');
  await control.waitForTimeout(2_000);
  expect((await status())?.restarts).toBe(1);
  expect((await status())?.recordingPath).toContain('part 2');
  await control.evaluate(() =>
    window.lampstand.command({ type: 'stream.stop', payload: { record: true } }),
  );
  await expect.poll(async () => (await status())?.state).toBe('idle');
});

test('the standard (CPU) pipeline still records when an ffmpeg encoder is chosen', async () => {
  const patchStream = (patch: object) =>
    control.evaluate(async (p) => {
      const r = await window.lampstand.query('settings.get');
      if (r.ok)
        await window.lampstand.command({
          type: 'settings.update',
          payload: {
            patch: {
              stream: { ...r.value.stream, ...p, quality: { ...r.value.stream.quality, ...p } },
            },
          },
        });
    }, patch);
  const status = () =>
    control.evaluate(async () => {
      const r = await window.lampstand.query('stream.status');
      return r.ok ? r.value : null;
    });
  await patchStream({ encoder: 'libx264' });
  await control.evaluate(() =>
    window.lampstand.command({ type: 'stream.start', payload: { record: true } }),
  );
  await expect.poll(async () => (await status())?.state, { timeout: 15_000 }).toBe('live');
  expect((await status())?.pipeline).toBe('cpu');
  await control.waitForTimeout(2_000);
  await control.evaluate(() =>
    window.lampstand.command({ type: 'stream.stop', payload: { record: true } }),
  );
  await expect.poll(async () => (await status())?.state).toBe('idle');
  await patchStream({ encoder: 'auto' });
});

test('Easy view lists the words; Turn off live takes everything off the screen', async () => {
  await mode('Show');
  const out = await outputPage();
  // The verse from the previous test is in the grid; Easy view shows its words, large.
  await control.getByRole('radio', { name: 'Easy' }).click();
  const list = control.getByRole('list', { name: 'Slide list' });
  await expect(list).toContainText('For God so loved the world');
  await control.screenshot({ path: 'test-results/23-easy-view.png' });
  await control.getByRole('radio', { name: 'Grid' }).first().click();
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

test('words edit in place on the canvas; Bible picks wait; announcements can stop looping', async () => {
  await mode('Show');
  // Double-click the slide in Edit: its words open right on the canvas.
  await (await servicePlan()).getByText('Text slides').last().click();
  await mode('Edit');
  const canvas = control.getByTestId('slide-canvas');
  await canvas.dblclick({ position: { x: 24, y: 24 } });
  // Typed right on the slide, in its own font; Esc stops typing.
  const words = canvas.getByLabel('Text', { exact: true });
  await words.fill('Typed on the slide');
  await words.press('Escape');
  await expect(words).toHaveCount(0);
  await expect(canvas.locator('.ls-text').last()).toContainText('Typed on the slide');

  // A verse picked in the Bible opens in the slides; the room keeps what it sees.
  const out = await outputPage();
  const onScreen = (await out.locator('.ls-text').last().textContent()) ?? '';
  await mode('Bible');
  const bible = control.getByRole('region', { name: 'Bible' });
  const genesis = bible.getByRole('button', { name: 'Genesis', exact: true });
  if (await genesis.count()) await genesis.click();
  await bible.getByRole('button', { name: /^3 And God said, Let there be light/ }).click();
  await expect(control.getByRole('list', { name: 'Slide list' })).toContainText(
    'Let there be light',
  );
  await control.waitForTimeout(400);
  await expect(out.locator('.ls-text').last()).toHaveText(onScreen);
  // Double-click shows it now.
  await bible.getByRole('button', { name: /^3 And God said, Let there be light/ }).dblclick();
  await expect(out.locator('.ls-text').last()).toContainText('Let there be light');

  // The Welcome announcements say they loop, and can be told to stay on each slide.
  await mode('Show');
  await (await servicePlan()).getByText('Welcome').first().click();
  const welcome = control.getByRole('region', { name: 'Welcome', exact: true }).first();
  const loop = welcome.getByRole('button', { name: /^Loops every \d+ s$/ });
  await expect(loop).toBeVisible();
  // Its menu: off, or how often (and every other item with slides has the same control).
  await loop.click();
  await control.getByRole('menuitem', { name: 'Off: wait for a click' }).click();
  await welcome.getByRole('button', { name: 'Stays on each slide' }).click();
  await control.getByRole('menuitem', { name: 'Every 5 s' }).click();
  await expect(welcome.getByRole('button', { name: 'Loops every 5 s' })).toBeVisible();
  await expect(
    control
      .getByRole('region', { name: /Psalm 23/ })
      .first()
      .getByRole('button', { name: 'Stays on each slide' }),
  ).toBeVisible();

  // A picture behind the words: the verse on screen stays, the picture goes behind it.
  await binTab('Media');
  const bin = control.getByRole('region', { name: 'Bin' });
  // On screen as media first: the button is still there, and moves it behind the words.
  await bin.getByRole('button', { name: 'Show now: Seed image' }).click();
  await expect(out.locator('.ls-layer-media img')).toHaveCount(1);
  await bin.getByRole('button', { name: 'Use behind the words: Seed image' }).click();
  await expect(out.locator('.ls-layer-media img')).toHaveCount(0);
  // The same from the picture's tile in the middle, with its layer button.
  await bin.getByRole('button', { name: 'Show now: Seed image' }).click();
  await expect(out.locator('.ls-layer-media img')).toHaveCount(1);
  // Its layer button: over everything → behind the words (it moves there at once).
  await control
    .getByRole('list', { name: 'Slide list' })
    .getByRole('button', { name: /^Plays over everything/ })
    .click();
  await expect(out.locator('.ls-layer-media img')).toHaveCount(0);
  await expect
    .poll(async () => {
      const r = await control.evaluate(() => window.lampstand.query('live.get'));
      const ref = r.ok ? r.value.program.background?.ref : null;
      return ref?.kind === 'image' ? ref.mediaId : null;
    })
    .toBe('seed-image');
});

test('playlists: fill a section, add and edit slides (live edits wait), delete the playlist', async () => {
  const library = control.getByRole('region', { name: 'Library' });
  await library.getByRole('button', { name: 'New playlist' }).click();
  await expect(library.getByRole('button', { name: 'New service', exact: true })).toBeVisible();
  await mode('Show');
  // A section, then a second one after it: what's added to the first must land before the second.
  const show = control.getByRole('region', { name: 'Slides', exact: true });
  for (let i = 0; i < 2; i++) {
    await show.getByRole('button', { name: 'Add', exact: true }).click();
    await control.getByRole('menuitem', { name: 'Section', exact: true }).click();
  }
  const bands = show.locator('[data-section="New section"]');
  await expect(bands).toHaveCount(2);
  const emptyPlaceholders = show.getByRole('button', { name: /^Nothing in this section yet/ });
  await expect(emptyPlaceholders).toHaveCount(2);
  // The "+" at the end of the first section adds text slides into it (before the second).
  await show
    .getByRole('button', { name: /^Nothing in this section yet/ })
    .first()
    .click();
  await control.getByRole('menuitem', { name: 'Slides', exact: true }).click();
  const kinds = () =>
    control.evaluate(async () => {
      const st = await window.lampstand.query('settings.get');
      if (!st.ok || !st.value.lastServiceId) return null;
      const plan = await window.lampstand.query('services.get', { id: st.value.lastServiceId });
      return plan.ok && plan.value
        ? plan.value.items
            .map((i) => (i.kind === 'presentation' ? `slides×${i.slides.length}` : i.kind))
            .join(' ')
        : null;
    });
  await expect.poll(kinds).toBe('header slides×1 header');
  await mode('Show'); // new slides open in Edit: back to the playlist
  await expect(emptyPlaceholders).toHaveCount(1);
  await expect(
    show.getByRole('button', { name: 'Add to New section', exact: false }),
  ).not.toHaveCount(0);
  // The "+" card at the end of the item adds a second slide (and opens it in Edit).
  const textItem = show.getByRole('region', { name: 'Text slides' });
  await textItem.getByRole('button', { name: 'Add a slide to Text slides' }).click();
  await expect.poll(kinds).toBe('header slides×2 header');
  await mode('Show');
  // Edit a slide while it is live: the room keeps the old words until Update live.
  const out = await outputPage();
  await textItem.getByRole('button', { name: /^Slide 1/ }).click();
  await expect(out.locator('.ls-text').last()).toContainText(/type your text here/i);
  await textItem.getByRole('listitem').first().hover();
  await textItem.getByRole('button', { name: /^Edit slide 1/ }).click();
  await control.getByRole('textbox', { name: 'Text', exact: true }).fill('Edited while live');
  const updateLive = control.getByRole('button', { name: 'Update live' });
  await expect(updateLive).toBeVisible();
  await control.waitForTimeout(400);
  await expect(out.locator('.ls-text').last()).not.toContainText('Edited while live');
  await updateLive.click();
  await expect(out.locator('.ls-text').last()).toContainText(/edited while live/i);
  await expect(updateLive).toHaveCount(0);
  await mode('Show');
  await control.screenshot({ path: 'test-results/43-section-add.png' });
  // Deleting a section takes everything in it (after a confirmation, in the app's own dialog).
  const plan = await servicePlan();
  await plan.locator('li').filter({ hasText: 'New section' }).first().hover();
  await plan.getByRole('button', { name: 'Delete section and everything in it' }).first().click();
  await control.waitForTimeout(400); // after the dialog's fade-in
  await control.screenshot({ path: 'test-results/43b-confirm.png' });
  await answer('Remove');
  await expect.poll(kinds).toBe('header');
  // Delete the playlist from its own menu: the other playlist opens in its place.
  await library.getByRole('button', { name: 'New service', exact: true }).hover();
  await library.getByRole('button', { name: 'Options for New service' }).click();
  await control.getByRole('menuitem', { name: 'Delete playlist' }).click();
  await answer('Delete');
  await expect(library.getByRole('button', { name: 'New service', exact: true })).toHaveCount(0);
  await expect
    .poll(async () =>
      control.evaluate(async () => {
        const st = await window.lampstand.query('settings.get');
        if (!st.ok || !st.value.lastServiceId) return null;
        const plan = await window.lampstand.query('services.get', { id: st.value.lastServiceId });
        return plan.ok && plan.value ? plan.value.name : null;
      }),
    )
    .toBe('Sample Sunday service');
});

test('control surfaces: OSC from a desk runs the show and the mixer; cues go back to it', async () => {
  // MIDI is allowed (the computer may have no devices: then simply none are listed).
  expect(
    await control.evaluate(() =>
      navigator.requestMIDIAccess({ sysex: false }).then(
        () => 'ok',
        (e: unknown) => (e instanceof Error ? e.name : String(e)),
      ),
    ),
  ).toBe('ok');
  // A stand-in for the desk: it hears Lampstand's cues and fader positions.
  const desk = createSocket('udp4');
  const heard: { address: string; args: (number | string)[] }[] = [];
  desk.on('message', (d) => heard.push(...decodeOsc(new Uint8Array(d))));
  await new Promise<void>((r) => desk.bind(0, '127.0.0.1', r));
  const port = 39000 + Math.floor(Math.random() * 1000);
  const surfaces = {
    midi: true,
    feedback: true,
    osc: { enabled: true, port, sendHost: '127.0.0.1', sendPort: desk.address().port },
    bindings: [
      {
        id: 'e2e-black',
        source: { kind: 'osc', address: '/lampstand/black' },
        target: { kind: 'action', action: 'black' },
      },
      {
        id: 'e2e-tracks',
        source: { kind: 'osc', address: '/lampstand/tracks' },
        target: { kind: 'fader', bus: 'channel', channelId: 'tracks' },
      },
    ],
    cues: [
      {
        id: 'e2e-cue',
        when: 'black',
        send: { kind: 'osc', address: '/desk/black', arg: { type: 'i', value: 1 } },
      },
    ],
  };
  await control.evaluate(
    (p) => window.lampstand.command({ type: 'settings.update', payload: { patch: p } }),
    { surfaces },
  );
  await expect
    .poll(() => control.evaluate(() => window.lampstand.oscStatus().then((s) => s.listening)))
    .toBe(true);
  const send = (address: string, args: Parameters<typeof encodeOsc>[1] = []) =>
    desk.send(encodeOsc(address, args), port, '127.0.0.1');
  const live = async () => {
    const r = await control.evaluate(() => window.lampstand.query('live.get'));
    if (!r.ok) throw new Error('live.get');
    return r.value;
  };
  // The desk's fader moves Lampstand's Tracks fader (45% of the travel is −20 dB).
  send('/lampstand/tracks', [{ type: 'f', value: 0.45 }]);
  await expect
    .poll(async () => (await live()).mixer.channels.find((c) => c.id === 'tracks')?.gainDb)
    .toBe(-20);
  // A button: the screen goes black, and the desk hears the cue for it.
  send('/lampstand/black');
  await expect.poll(async () => (await live()).program.masks.black).toBe(true);
  await expect.poll(() => heard.some((m) => m.address === '/desk/black')).toBe(true);
  expect(heard.find((m) => m.address === '/desk/black')?.args).toEqual([1]);
  // Moving the fader in Lampstand sends its position back (motor faders follow).
  await control.evaluate(() =>
    window.lampstand.command({
      type: 'live.mixer',
      payload: { action: 'channel', id: 'tracks', patch: { gainDb: 0 } },
    }),
  );
  await expect
    .poll(() => heard.filter((m) => m.address === '/lampstand/tracks').at(-1)?.args[0])
    .toBeCloseTo(0.79375, 3);
  // The settings page shows the controls and the cue.
  await control.getByTitle('Settings', { exact: true }).click();
  await control
    .getByRole('navigation', { name: 'Settings' })
    .getByRole('button', { name: 'Control surfaces', exact: true })
    .click();
  await expect(
    control.getByRole('heading', { name: 'Control surfaces', exact: true }),
  ).toBeVisible();
  await expect(control.getByText('/lampstand/tracks')).toBeVisible();
  await control.waitForTimeout(300);
  await control.screenshot({ path: 'test-results/40-control-surfaces.png' });
  await control.keyboard.press('Escape');
  // Back as it was for the tests after this one.
  send('/lampstand/black');
  await expect.poll(async () => (await live()).program.masks.black).toBe(false);
  await control.evaluate(() =>
    window.lampstand.command({
      type: 'settings.update',
      payload: {
        patch: {
          surfaces: {
            midi: true,
            feedback: true,
            osc: { enabled: false, port: 9000, sendHost: '', sendPort: 10023 },
            bindings: [],
            cues: [],
          },
        },
      },
    }),
  );
  desk.close();
});

test('slide tiles: the background as its own tile, group hotkeys, a slide’s own background, Table view', async () => {
  const out = await outputPage();
  await mode('Show');
  await previewFirst(false);
  await (await servicePlan()).getByText('Test Song').first().click();
  // The playlist has the song more than once by now: the first will do.
  const song = control.getByRole('region', { name: 'Test Song', exact: true }).first();
  // The song's background is a tile of its own; its slides are the words over a backdrop.
  await expect(
    song.getByRole('button', { name: 'Background of these slides', exact: true }),
  ).toBeVisible();
  await control.waitForTimeout(600);
  await control.screenshot({ path: 'test-results/50a-slide-tiles.png' });
  // Group hotkeys: C goes to the chorus, A to the first verse.
  await control.locator('body').click({ position: { x: 5, y: 5 } });
  await control.keyboard.press('c');
  await expect(out.locator('.ls-text').last()).toContainText('Chorus test line');
  await control.keyboard.press('a');
  await expect(out.locator('.ls-text').last()).toContainText('Hallelujah test line');
  // One slide on a background of its own, then back to the song's.
  await song.getByRole('button', { name: 'Background of slide 2' }).click();
  await control.getByRole('menuitem', { name: 'Built-in backgrounds' }).click();
  await control.getByRole('menuitem', { name: 'Ice halo', exact: true }).click();
  const own = song.getByRole('button', {
    name: 'Slide 2 has its own background (click to change)',
  });
  await expect(own).toBeVisible();
  await control.waitForTimeout(600);
  await control.screenshot({ path: 'test-results/50b-slide-own-background.png' });
  await own.click();
  await control.getByRole('menuitem', { name: 'The same as the other slides' }).click();
  await expect(song.getByRole('button', { name: 'Background of slide 2' })).toBeAttached();
  // Table view: each slide's words beside a small thumbnail.
  const views = control.getByRole('radiogroup', { name: 'Slide view' });
  await views.getByRole('radio', { name: 'Table' }).click();
  await expect(song.getByText('Chorus test line').first()).toBeVisible();
  await control.waitForTimeout(400);
  await control.screenshot({ path: 'test-results/50c-table-view.png' });
  await views.getByRole('radio', { name: 'Grid' }).click();
  // Slides by group, on a black backdrop; then back as they were.
  await control.getByRole('button', { name: 'View options' }).click();
  await control.getByRole('menuitemcheckbox', { name: 'Slides by group' }).click();
  await control.getByRole('button', { name: 'View options' }).click();
  await control.getByRole('menuitemradio', { name: 'Black' }).click();
  await control.waitForTimeout(400);
  await control.screenshot({ path: 'test-results/50d-by-group.png' });
  await control.getByRole('button', { name: 'View options' }).click();
  await control.getByRole('menuitemcheckbox', { name: 'Slides by group' }).click();
  await control.getByRole('button', { name: 'View options' }).click();
  await control.getByRole('menuitemradio', { name: 'Checkerboard' }).click();
  // Default transitions, bottom left: slides (orange) and media (purple).
  const program = async () => {
    const r = await control.evaluate(() => window.lampstand.query('live.get'));
    return r.ok ? r.value.program : null;
  };
  await control.getByRole('button', { name: /^Slide transition:/ }).click();
  await control.getByRole('menuitem', { name: 'Cut' }).click();
  await song
    .getByRole('button', { name: /Chorus/ })
    .first()
    .click();
  await expect.poll(async () => (await program())?.transition?.kind).toBe('cut');
  await control.getByRole('button', { name: /^Media transition:/ }).click();
  await control.getByRole('menuitem', { name: 'Dissolve' }).click();
  await expect.poll(async () => (await program())?.mediaTransition?.kind).toBe('dissolve');
  await control.waitForTimeout(300);
  await control.screenshot({ path: 'test-results/50e-transitions.png' });
  // An item's own transition beats the default.
  await song.getByRole('button', { name: /^Transition: the default/ }).click();
  await control.getByRole('menuitem', { name: 'Zoom' }).click();
  await song
    .getByRole('button', { name: /Verse 1/ })
    .first()
    .click();
  await expect.poll(async () => (await program())?.transition?.kind).toBe('zoom');
  // Back as they were.
  await song.getByRole('button', { name: /^Transition: Zoom/ }).click();
  await control.getByRole('menuitem', { name: /^The default/ }).click();
  await control.getByRole('button', { name: /^Slide transition:/ }).click();
  await control.getByRole('menuitem', { name: 'Each theme’s own' }).click();
  await control.getByRole('button', { name: /^Media transition:/ }).click();
  await control.getByRole('menuitem', { name: /^The usual/ }).click();
  await expect.poll(async () => (await program())?.mediaTransition).toBeUndefined();
  // The background's corner icon switches its layer, as on a media cue: behind the words, or
  // over everything. First give the song a picture: the seed image, put behind the words.
  await binTab('Media');
  await control
    .getByRole('region', { name: 'Bin' })
    .getByRole('button', { name: 'Show now: Seed image' })
    .click();
  await control
    .getByRole('list', { name: 'Slide list' })
    .getByRole('button', { name: /^Plays over everything/ })
    .click();
  await (await servicePlan()).getByText('Test Song').first().click();
  await song.getByRole('button', { name: 'Background for these slides' }).click();
  await control.getByRole('menuitem', { name: 'The one on screen now' }).click();
  const layer = song.getByRole('button', { name: /^Plays behind the words/ });
  await layer.click();
  await expect(song.getByRole('button', { name: /^Plays over everything/ })).toBeVisible();
  await song.getByRole('button', { name: 'Background of these slides', exact: true }).click();
  await expect.poll(async () => (await program())?.media?.mediaId).toBe('seed-image');
  await control.waitForTimeout(400);
  await control.screenshot({ path: 'test-results/50f-background-over.png' });
  // Back behind the words, and back on the theme's background.
  await song.getByRole('button', { name: /^Plays over everything/ }).click();
  await expect.poll(async () => (await program())?.media ?? null).toBeNull();
  await song.getByRole('button', { name: 'Background for these slides' }).click();
  await control.getByRole('menuitem', { name: 'The theme’s background' }).click();
  // Words back on screen for the next test.
  await song
    .getByRole('button', { name: /Verse 1/ })
    .first()
    .click();
  await expect(out.locator('.ls-text').last()).toContainText('Hallelujah test line');
});

test('screens: fit each screen, edge blending, a readability overlay, the multi-view', async () => {
  const out = await outputPage();
  const settingsOf = async () => {
    const r = await control.evaluate(() => window.lampstand.query('settings.get'));
    if (!r.ok) throw new Error('no settings');
    return r.value;
  };
  // Fit the rehearsal window: nudge its top-left corner with the keyboard (keystone), flip it.
  await control.getByRole('banner').getByRole('button', { name: 'More' }).click();
  await control.getByRole('menuitem', { name: 'Masks…' }).click();
  const fit = control.locator('section[data-section="Fit each screen"]');
  const corner = fit.getByRole('button', { name: 'Top-left corner' });
  await corner.focus();
  for (let i = 0; i < 4; i++) await control.keyboard.press('ArrowRight');
  await expect
    .poll(async () => (await settingsOf()).screenAdjust['window-main']?.corners.tl.x)
    .toBe(2);
  const screen = out.locator('#host');
  await expect
    .poll(() => screen.evaluate((e) => (e as HTMLElement).style.transform))
    .toContain('matrix3d(');
  await fit.getByRole('switch', { name: 'Upside down' }).click();
  await expect.poll(async () => (await settingsOf()).screenAdjust['window-main']?.flipV).toBe(true);
  await control.waitForTimeout(400);
  await control.screenshot({ path: 'test-results/52-screen-fit.png' });
  await fit.getByRole('button', { name: 'Reset' }).click();
  await expect.poll(async () => (await settingsOf()).screenAdjust['window-main']).toBeUndefined();
  await expect.poll(() => screen.evaluate((e) => (e as HTMLElement).style.transform)).toBe('');

  // Edge blending: rehearsing, a second window stands in for the second projector; each shows
  // its part of one wide picture, the overlap faded on the inner edges.
  const blendGroup = control.locator('section[data-section="Edge blending"]');
  await blendGroup.getByRole('switch', { name: 'Blend the audience screens' }).click();
  await expect
    .poll(() => app.windows().filter((w) => w.url().includes('id=window-blend-1')).length, {
      timeout: 10_000,
    })
    .toBe(1);
  const second = app.windows().find((w) => w.url().includes('id=window-blend-1'));
  if (!second) throw new Error('no blend window');
  // The stand-in sits to the left of the main window, so it shows the picture's left part.
  await expect(second.locator('.ls-blend-right')).toHaveCount(1, { timeout: 10_000 });
  await expect(second.locator('.ls-blend-left')).toHaveCount(0);
  await expect(out.locator('.ls-blend-left')).toHaveCount(1);
  // 15% overlap: the picture is 1.85 screens wide; the right-hand screen starts 0.85 in.
  await expect
    .poll(() => out.locator('#picture').evaluate((e) => (e as HTMLElement).style.left))
    .toBe('-85%');
  await control.screenshot({ path: 'test-results/52b-edge-blend.png' });
  await blendGroup.getByRole('switch', { name: 'Blend the audience screens' }).click();
  await expect
    .poll(() => app.windows().filter((w) => w.url().includes('id=window-blend-1')).length)
    .toBe(0);
  await expect(out.locator('.ls-blend-left')).toHaveCount(0);
  await control.keyboard.press('Escape');

  // A readability overlay over an item's background: the bottom shaded behind the words.
  await control.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K');
  await control.keyboard.type('jn 3 16');
  await expect(control.getByRole('option').first()).toContainText('John 3:16');
  await control.keyboard.press('Shift+Enter');
  await control.getByRole('button', { name: 'Background for these slides' }).first().click();
  await control.getByRole('menuitem', { name: /^Readability overlay/ }).click();
  await control.getByRole('menuitemradio', { name: 'Shade the bottom' }).click();
  await expect
    .poll(async () => {
      const r = await control.evaluate(() => window.lampstand.query('live.get'));
      return r.ok ? (r.value.program.background?.adjust?.scrim?.style ?? null) : null;
    })
    .toBe('bottom');
  await expect(out.locator('.ls-bg-scrim').last()).toBeAttached();
  // (Picking closes the menu: an Escape now would reach the show and clear the words.)
  await control.getByRole('button', { name: 'Background for these slides' }).first().click();
  await control.getByRole('menuitem', { name: /^Readability overlay/ }).click();
  await control.getByRole('menuitemradio', { name: 'None (the theme’s)' }).click();
  await expect(out.locator('.ls-bg-scrim')).toHaveCount(0);

  // The multi-view: every screen and camera in a window of its own (from Outputs).
  await control.getByRole('button', { name: /^Stage:/ }).click();
  await control.getByRole('menuitem', { name: 'Output settings…' }).click();
  const outputs = control.getByRole('dialog', { name: 'Outputs' });
  await outputs.getByText('More output types').click();
  // SDI and Syphon are still to come; the rest are real.
  await expect(outputs.locator('[data-testid="soon-list"] li')).toHaveCount(2);
  await outputs.getByRole('button', { name: 'Open multi-view' }).click();
  await expect
    .poll(() => app.windows().filter((w) => w.url().includes('view=multiview')).length, {
      timeout: 10_000,
    })
    .toBe(1);
  const mv = app.windows().find((w) => w.url().includes('view=multiview'));
  if (!mv) throw new Error('no multi-view');
  await expect(mv.getByRole('group', { name: 'Program' })).toBeVisible();
  await expect(mv.getByRole('group', { name: 'Stage display' })).toBeVisible();
  await expect(mv.getByRole('img', { name: 'Program' })).toBeVisible();
  await mv.waitForTimeout(600);
  await mv.screenshot({ path: 'test-results/52c-multiview.png' });
  await control.evaluate(() =>
    window.lampstand.command({ type: 'multiview.open', payload: { open: false } }),
  );
  await expect
    .poll(() => app.windows().filter((w) => w.url().includes('view=multiview')).length)
    .toBe(0);
  // Closed with its button: Escape in the show would clear the words on screen.
  await outputs.getByRole('button', { name: 'Close' }).first().click();
  await expect(outputs).toHaveCount(0);
  await expect(out.locator('.ls-text').last()).toContainText('For God so loved');
});

test('output survives a control renderer crash', async () => {
  const out = await outputPage();
  // Whatever is on screen must stay there while the control window is gone.
  const before = (await out.locator('.ls-text').last().textContent()) ?? '';
  expect(before.length).toBeGreaterThan(0);
  await app.evaluate(({ BrowserWindow }) => {
    const ctl = BrowserWindow.getAllWindows().find((w) => w.getTitle() === 'Lampstand');
    ctl?.webContents.forcefullyCrashRenderer();
  });
  await new Promise((r) => setTimeout(r, 1500));
  await expect(out.locator('.ls-text').last()).toHaveText(before);
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
