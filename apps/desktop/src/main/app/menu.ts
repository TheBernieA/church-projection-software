import { BrowserWindow, Menu, type BaseWindow, type MenuItemConstructorOptions } from 'electron';
import type { MenuAction } from '@lampstand/ipc-contract';

/**
 * Application menu. Edit › Undo / Redo cover both kinds of undo: the native one undoes typing
 * in a focused text field (and does nothing otherwise), and the control window undoes
 * Lampstand's own edits (the service plan, songs…) when no text field has focus.
 * Their shortcuts are shown but not registered here, so ⌘Z keeps reaching the page, which
 * already handles it — registering them too would undo twice.
 */
export function installAppMenu(send: (action: MenuAction) => void): void {
  const run = (action: MenuAction) => (_: unknown, win: BaseWindow | undefined) => {
    if (win instanceof BrowserWindow) win.webContents[action]();
    send(action);
  };
  const isMac = process.platform === 'darwin';
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo',
          accelerator: 'CmdOrCtrl+Z',
          registerAccelerator: false,
          click: run('undo'),
        },
        {
          label: 'Redo',
          accelerator: 'Shift+CmdOrCtrl+Z',
          registerAccelerator: false,
          click: run('redo'),
        },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
