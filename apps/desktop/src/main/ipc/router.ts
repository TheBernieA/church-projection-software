import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import type { CommandBus, Result } from '@lampstand/core';
import { toErrorShape } from '@lampstand/core';
import {
  Channels,
  CommandEnvelopeSchema,
  QUERY_NAMES,
  QuerySchemas,
  type QueryName,
  type QueryResults,
} from '@lampstand/ipc-contract';
import type { Logger } from '../app/logger';
import type { WindowKind } from '../security/hardening';
import { APP_SCHEME } from '../security/protocols';

export type QueryHandlers = {
  [K in QueryName]: (args: never) => Promise<QueryResults[K]> | QueryResults[K];
};

/** Commands that any control-window source may issue are everything registered on the bus. */
interface RouterDeps {
  bus: CommandBus;
  queries: QueryHandlers;
  kindOf: (e: IpcMainInvokeEvent | IpcMainEvent) => WindowKind | null;
  onOutputReady: (e: IpcMainEvent) => void;
  log: Logger;
}

/** Only our own bundle (or the Vite dev server in development) may talk to main (§17.2). */
export function isTrustedFrameUrl(url: string | undefined): boolean {
  if (!url) return false;
  const dev = process.env.ELECTRON_RENDERER_URL;
  if (dev && url.startsWith(dev)) return true;
  return url.startsWith(`${APP_SCHEME}://bundle/`);
}

function trusted(e: IpcMainInvokeEvent | IpcMainEvent): boolean {
  return isTrustedFrameUrl(e.senderFrame?.url);
}

const forbidden: Result<never> = {
  ok: false,
  error: { code: 'forbidden', message: 'Not allowed.' },
};

/**
 * Typed, validated IPC (§17.2): every payload is Zod-parsed; the sending window type is
 * checked (outputs may only subscribe, never mutate); errors never leak stacks or paths.
 */
export function registerIpc(d: RouterDeps): void {
  const isControl = (e: IpcMainInvokeEvent): boolean => trusted(e) && d.kindOf(e) === 'control';

  ipcMain.handle(Channels.command, async (e, raw: unknown) => {
    if (!isControl(e)) return forbidden;
    const env = CommandEnvelopeSchema.safeParse(raw);
    if (!env.success)
      return { ok: false, error: { code: 'invalid-payload', message: 'Invalid command.' } };
    return d.bus.dispatch({
      type: env.data.type,
      payload: env.data.payload,
      source: env.data.source,
    });
  });
  ipcMain.handle(Channels.undo, (e) => (isControl(e) ? d.bus.undo() : forbidden));
  ipcMain.handle(Channels.redo, (e) => (isControl(e) ? d.bus.redo() : forbidden));

  for (const name of QUERY_NAMES) {
    ipcMain.handle(Channels.query(name), async (e, raw: unknown) => {
      if (!isControl(e)) return forbidden;
      const parsed = QuerySchemas[name].safeParse(raw);
      if (!parsed.success)
        return { ok: false, error: { code: 'invalid-payload', message: 'Invalid request.' } };
      try {
        const handler = d.queries[name] as (a: unknown) => Promise<unknown>;
        return { ok: true, value: await handler(parsed.data) };
      } catch (err) {
        d.log.warn('query failed', { name, err: err instanceof Error ? err.message : 'unknown' });
        return { ok: false, error: toErrorShape(err) };
      }
    });
  }

  ipcMain.on(Channels.outputReady, (e) => {
    if (!trusted(e)) return;
    const kind = d.kindOf(e);
    if (kind === 'output' || kind === 'stage') d.onOutputReady(e);
  });
}
