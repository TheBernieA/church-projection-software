import { BrowserWindow, type NativeImage, type WebContents } from 'electron';
import {
  resolveStageLayout,
  type LiveState,
  type ResolvedKindThemes,
  type ScreenVisual,
  type Settings,
  type Standby,
  type Theme,
  type VideoInputLayer,
} from '@lampstand/core';
import { Channels, type StreamConfig } from '@lampstand/ipc-contract';
import { rendererUrl } from '../security/protocols';
import { secureWebPreferences } from '../security/hardening';
import type { WindowManager } from '../windows/windowManager';
import type { Logger } from '../types';

/**
 * The offscreen windows that draw a stream picture (the stream page): the livestream's own, and
 * each NDI feed's. Made, configured and repainted the same way for both.
 */

/** What a stream picture is drawn from (the livestream and NDI share these). */
export interface PictureSources {
  log: Logger;
  windows: WindowManager;
  getSettings: () => Settings;
  getLiveState: () => LiveState;
  logo: () => ScreenVisual;
  standby: () => Standby;
  /** The theme chosen for the stream's lower third (resolved from its id), or null. */
  wordsTheme: () => Theme | null;
  /** Themes the stream uses instead of each slide's own, by kind of slide. */
  kindThemes: () => ResolvedKindThemes;
  /** The alternate (HDMI) output's themes, for a stream that mirrors it. */
  alternateThemes: () => ResolvedKindThemes;
}

/**
 * A camera as a screen layer, with its saved settings; its capture size is never larger than
 * the stream (a 4K webcam is asked for 720p on a 720p stream: far less to decode).
 */
function cameraLayerFor(s: Settings, id: string | null, height: number): VideoInputLayer | null {
  if (!id) return null;
  const c = s.cameras[id];
  const cap = height >= 1080 ? '1080' : '720';
  const wanted = c?.resolution ?? 'auto';
  const resolution = wanted === 'auto' || Number(wanted) > Number(cap) ? cap : wanted;
  return {
    deviceId: id,
    label: c?.name || 'Camera',
    fit: c?.fit ?? 'cover',
    mirror: c?.mirror ?? false,
    resolution,
  };
}

/**
 * What a stream picture needs besides its settings: its cameras (the second only for a layout),
 * and the stage layout and alternate output's themes when it mirrors one of those screens.
 */
export function streamPictureExtras(
  s: Settings,
  height: number,
  alternateThemes: ResolvedKindThemes,
): Pick<StreamConfig, 'cameraLayer' | 'secondCameraLayer' | 'alternateThemes' | 'stageLayout'> {
  const p = s.stream.picture;
  return {
    cameraLayer: cameraLayerFor(s, p.camera, height),
    secondCameraLayer: p.background === 'layout' ? cameraLayerFor(s, p.secondCamera, height) : null,
    alternateThemes: p.mirror === 'alternate' ? alternateThemes : {},
    stageLayout: resolveStageLayout(s.stageLayouts, s.stageLayoutId),
  };
}

/**
 * Open a hidden window drawing the stream page at this size and rate. `offscreen` picks how its
 * frames come out (copied bitmaps, or GPU shared textures); `onCrash` runs if its page dies.
 */
export function openPictureWindow(o: {
  windows: WindowManager;
  width: number;
  height: number;
  fps: number;
  offscreen: Electron.WebPreferences['offscreen'];
  /** A see-through picture (alpha), for a key feed. */
  transparent?: boolean;
  onPaint: (
    e: Electron.Event & { texture?: Electron.OffscreenSharedTexture },
    image: NativeImage,
  ) => void;
  onCrash: () => void;
}): BrowserWindow {
  const win = new BrowserWindow({
    show: false,
    width: o.width,
    height: o.height,
    useContentSize: true,
    frame: false,
    transparent: !!o.transparent,
    paintWhenInitiallyHidden: true,
    backgroundColor: o.transparent ? '#00000000' : '#000000',
    webPreferences: secureWebPreferences('stream', {
      offscreen: o.offscreen,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
    }),
  });
  win.webContents.setFrameRate(o.fps);
  o.windows.attachFollower(win, 'stream');
  win.webContents.on('paint', (e, _dirty, image) => o.onPaint(e, image));
  win.webContents.on('render-process-gone', () => o.onCrash());
  void win.loadURL(rendererUrl('stream'));
  return win;
}

/** A painted picture as raw BGRA at exactly this size (one copy). */
export function bitmapOf(image: NativeImage, width: number, height: number): Buffer {
  const sz = image.getSize();
  return (
    sz.width === width && sz.height === height ? image : image.resize({ width, height })
  ).toBitmap();
}

/**
 * The parts of a stream window's configuration every picture has: its size, the logo and off-air
 * screen. The rest (what it shows, sound, encoding) is the caller's.
 */
export function sendPictureConfig(
  wc: WebContents,
  src: PictureSources,
  size: { width: number; height: number },
  rest: Omit<StreamConfig, 'width' | 'height' | 'logo' | 'standby'>,
): void {
  const config: StreamConfig = { ...size, ...rest, logo: src.logo(), standby: src.standby() };
  wc.send(Channels.evStreamConfig, config);
}
