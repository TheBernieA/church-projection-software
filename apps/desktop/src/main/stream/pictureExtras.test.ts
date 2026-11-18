import { describe, expect, it, vi } from 'vitest';
import { defaultSettings, type Settings } from '@lampstand/core';

vi.mock('electron', () => ({
  app: {},
  BrowserWindow: function BrowserWindow() {},
  ipcMain: {},
  nativeImage: {},
}));
const { streamPictureExtras } = await import('./streamController');

const withPicture = (p: Partial<Settings['stream']['picture']>): Settings => {
  const s = defaultSettings();
  return { ...s, stream: { ...s.stream, picture: { ...s.stream.picture, ...p } } };
};
const alt = { lyrics: { id: 'alt' } } as never;

describe('stream picture extras', () => {
  it('opens the second camera only for a layout', () => {
    const one = streamPictureExtras(withPicture({ camera: 'a', secondCamera: 'b' }), 720, alt);
    expect(one.cameraLayer?.deviceId).toBe('a');
    expect(one.secondCameraLayer).toBeNull();
    const two = streamPictureExtras(
      withPicture({ background: 'layout', camera: 'a', secondCamera: 'b' }),
      720,
      alt,
    );
    expect(two.secondCameraLayer?.deviceId).toBe('b');
    expect(two.secondCameraLayer?.resolution).toBe('720');
  });

  it('carries the alternate output’s themes only when mirroring it, and always a stage layout', () => {
    expect(streamPictureExtras(withPicture({}), 1080, alt).alternateThemes).toEqual({});
    expect(
      streamPictureExtras(withPicture({ mirror: 'alternate' }), 1080, alt).alternateThemes,
    ).toBe(alt);
    expect(
      streamPictureExtras(withPicture({ mirror: 'stage' }), 1080, alt).stageLayout.id,
    ).toBeTruthy();
  });
});
