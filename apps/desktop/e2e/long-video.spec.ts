import { _electron as electron, expect, test } from '@playwright/test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Seeking a long video (10 min, e2e/fixtures/long.mp4): one drag sends exactly one seek, the
 * projector jumps there and stays. (Byte-range serving, which multi-GB files need to seek, is
 * covered by the media-protocol test in smoke.spec.ts and the unit tests; this small fixture
 * loads whole, so it can't detect that.)
 */
test('dragging the progress bar seeks a long video on the output, and it sticks', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lampstand-long-'));
  const mediaDir = join(dir, 'library', 'media');
  mkdirSync(join(mediaDir, '.meta'), { recursive: true });
  const clip = readFileSync(join(__dirname, 'fixtures', 'long.mp4'));
  writeFileSync(join(mediaDir, 'long.mp4'), clip);
  const now = new Date().toISOString();
  writeFileSync(
    join(mediaDir, '.meta', 'long.media.json'),
    JSON.stringify({
      id: 'long',
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
      name: 'Long clip',
      kind: 'video',
      fileName: 'long.mp4',
      mimeType: 'video/mp4',
      sizeBytes: clip.length,
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
  const app = await electron.launch({ args: ['.'], cwd: join(__dirname, '..'), env });
  try {
    const control = await app.firstWindow();
    await control.waitForSelector('text=Sample Sunday service', { timeout: 30_000 });
    await control.evaluate(() =>
      window.lampstand.command({
        type: 'settings.update',
        payload: { patch: { windowMode: true } },
      }),
    );
    const mediaTab = control.getByRole('button', { name: 'Media', exact: true });
    if ((await mediaTab.getAttribute('aria-pressed')) !== 'true') await mediaTab.click();
    await control
      .locator('aside')
      .getByText('Long clip')
      .locator('..')
      .locator('..')
      .locator('button')
      .first()
      .click();
    await control.locator('body').click({ position: { x: 5, y: 5 } });
    await control.keyboard.press('Space');
    await expect.poll(() => app.windows().some((w) => w.url().includes('/output/'))).toBe(true);
    const out = app.windows().find((w) => w.url().includes('/output/'))!;
    const video = out.locator('.ls-layer-media video');
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
      .toBeGreaterThan(0.3);

    const mediaCommands = async (): Promise<number> => {
      const r = await control.evaluate(() => window.lampstand.query('audit.recent'));
      return r.ok ? r.value.filter((e: { type: string }) => e.type === 'live.media').length : 0;
    };
    const before = await mediaCommands();
    const slider = control.getByRole('slider', { name: 'Position' });
    const box = (await slider.boundingBox())!;
    const thumbX = (Number(await slider.inputValue()) / 600) * box.width;
    await control.mouse.move(box.x + thumbX + 2, box.y + box.height / 2);
    await control.mouse.down();
    await control.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2, { steps: 10 });
    await control.mouse.up();

    await expect.poll(mediaCommands).toBe(before + 1);
    // Halfway through the 10-minute clip, on the projector, and still there a moment later.
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 10_000 })
      .toBeGreaterThan(270);
    await control.waitForTimeout(1000);
    const t = await video.evaluate((v: HTMLVideoElement) => v.currentTime);
    expect(t).toBeGreaterThan(270);
    expect(t).toBeLessThan(330);
    expect(Number(await slider.inputValue())).toBeGreaterThan(270);
    expect(await mediaCommands()).toBe(before + 1);
  } finally {
    await app.close().catch(() => undefined);
    rmSync(dir, { recursive: true, force: true });
  }
});
