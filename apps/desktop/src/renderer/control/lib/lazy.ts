import { lazy, type ComponentType } from 'react';

const loaders: (() => Promise<unknown>)[] = [];

/**
 * Load a named export on first use (code splitting): views that aren't needed at startup, such
 * as settings, editors and the less-used workspaces, stay out of the startup bundle.
 */
export function lazyNamed<M extends Record<K, ComponentType<P>>, K extends keyof M, P = object>(
  load: () => Promise<M>,
  name: K,
) {
  loaders.push(load);
  return lazy(async () => ({ default: (await load())[name] }));
}

/**
 * Fetch every lazy view in the background once the window is idle, so the first open of a
 * dialog or workspace is instant without making startup wait for them.
 */
export function preloadLazyViews(): void {
  const run = (): void => {
    for (const load of loaders) void load().catch(() => undefined);
  };
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 3000 });
  else setTimeout(run, 1500);
}
