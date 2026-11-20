import { app } from 'electron';
import { join } from 'node:path';
import { type AppPaths } from '../types';

/** Directory layout from §6.1. */
export function resolvePaths(libraryOverride?: string): AppPaths {
  const userData = app.getPath('userData');
  const resources = app.isPackaged
    ? join(process.resourcesPath, 'resources')
    : join(app.getAppPath(), '../../resources');
  return {
    userData,
    settingsFile: join(userData, 'settings.json'),
    bibles: join(userData, 'bibles'),
    hymnals: join(userData, 'hymnals'),
    cache: join(userData, 'cache'),
    logs: join(userData, 'logs'),
    backups: join(userData, 'backups'),
    library:
      libraryOverride ??
      process.env.LAMPSTAND_LIBRARY ??
      join(app.getPath('documents'), 'Lampstand Library'),
    resources,
  };
}
