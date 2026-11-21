import type { ElectronApplication, Page } from '@playwright/test';

/**
 * The control window. The app opens a splash first, so firstWindow() may be that: this waits
 * for the window that loads the control page.
 */
export async function controlWindow(app: ElectronApplication, timeoutMs = 30_000): Promise<Page> {
  const isControl = (p: Page): boolean => !p.isClosed() && p.url().includes('/control/');
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = app.windows().find(isControl);
    if (found) return found;
    if (Date.now() > deadline)
      throw new Error(
        `no control window; windows: ${JSON.stringify(app.windows().map((w) => w.url()))}`,
      );
    await app.waitForEvent('window', { timeout: 250 }).catch(() => undefined);
  }
}
