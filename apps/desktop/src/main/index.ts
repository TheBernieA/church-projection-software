import { app } from 'electron';
import { AppController } from './app/appController';
import { registerSchemes } from './security/protocols';

// Test/portable override: isolated profile directory (used by the E2E suite).
if (process.env.LAMPSTAND_USER_DATA) app.setPath('userData', process.env.LAMPSTAND_USER_DATA);

// Single instance: a second launch focuses the running app instead of fighting over displays.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  registerSchemes();
  app.enableSandbox();
  const controller = new AppController();

  app.on('second-instance', () => controller.focusControl());

  app
    .whenReady()
    .then(() => controller.start())
    .catch((e: unknown) => {
      console.error('Fatal startup error', e);
      app.exit(1);
    });

  let shuttingDown = false;
  app.on('before-quit', (e) => {
    if (shuttingDown) return;
    shuttingDown = true;
    e.preventDefault();
    void controller.shutdown().finally(() => app.quit());
  });

  app.on('window-all-closed', () => app.quit());
}
