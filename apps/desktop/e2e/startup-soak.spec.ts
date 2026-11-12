import { _electron as electron, test } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Diagnostic soak (on demand): SOAK_RUNS=20 pnpm e2e -- startup-soak
// Launches with a fresh profile N times; on failure dumps main-process output.
test('startup soak', async () => {
  test.skip(!process.env.SOAK_RUNS, 'set SOAK_RUNS to run');
  test.setTimeout(600_000);
  let failures = 0;
  for (let n = 0; n < Number(process.env.SOAK_RUNS ?? 15); n++) {
    const dir = mkdtempSync(join(tmpdir(), 'ls-soak-'));
    const env = {
      ...process.env,
      LAMPSTAND_USER_DATA: join(dir, 'u'),
      LAMPSTAND_LIBRARY: join(dir, 'l'),
    };
    delete env.ELECTRON_RUN_AS_NODE;
    const app = await electron.launch({ args: ['.'], cwd: join(__dirname, '..'), env });
    const out: string[] = [];
    app.process().stdout?.on('data', (d: Buffer) => out.push(d.toString()));
    app.process().stderr?.on('data', (d: Buffer) => out.push('ERR ' + d.toString()));
    const pageErrors: string[] = [];
    try {
      const page = await app.firstWindow();
      page.on('pageerror', (e) => pageErrors.push(e.message));
      page.on('console', (m) => m.type() === 'error' && pageErrors.push('console: ' + m.text()));
      await page.waitForSelector('text=Sample Sunday service', { timeout: 15_000 });
      process.stdout.write('.');
    } catch (e) {
      failures++;
      console.log(`\nFAIL run ${n}: ${(e as Error).message.split('\n')[0]}`);
      console.log('WINDOWS', JSON.stringify(app.windows().map((w) => w.url())));
      console.log('PAGE ERRORS', JSON.stringify(pageErrors));
      console.log('MAIN OUTPUT\n' + out.join('').slice(-3000));
    }
    await app.close().catch(() => undefined);
    rmSync(dir, { recursive: true, force: true });
  }
  console.log(`\nfailures=${failures}`);
});
