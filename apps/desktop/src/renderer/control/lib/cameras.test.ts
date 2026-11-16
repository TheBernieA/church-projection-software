import { describe, expect, it, vi } from 'vitest';

vi.mock('./api', () => ({ cmd: vi.fn(), q: vi.fn(), api: {} }));
vi.mock('./actions', () => ({ saveSettings: vi.fn() }));
vi.mock('./store', () => ({ attempt: vi.fn(), useStore: { getState: () => ({}) } }));
vi.mock('@lampstand/renderer', () => ({ RAW_AUDIO: {} }));

const { migrateLocalCameras, DEFAULT_CAMERA } = await import('./inputs');

const storage = (value: string | null) => {
  let v = value;
  return {
    getItem: () => v,
    removeItem: () => {
      v = null;
    },
    get value() {
      return v;
    },
  };
};

describe('camera settings move from local storage into settings', () => {
  it('moves them once, filling in defaults, and forgets the old copy', () => {
    const st = storage(JSON.stringify({ cam1: { mirror: true }, cam2: { name: 'Pulpit' } }));
    expect(migrateLocalCameras({}, st)).toEqual({
      cam1: { ...DEFAULT_CAMERA, mirror: true },
      cam2: { ...DEFAULT_CAMERA, name: 'Pulpit' },
    });
    expect(st.value).toBeNull();
    expect(migrateLocalCameras({}, st)).toBeNull();
  });

  it('never overwrites settings already saved with the app', () => {
    const st = storage(JSON.stringify({ cam1: { mirror: true } }));
    expect(migrateLocalCameras({ cam9: { ...DEFAULT_CAMERA } }, st)).toBeNull();
    expect(st.value).toBeNull();
  });

  it('ignores junk', () => {
    expect(migrateLocalCameras({}, storage('not json'))).toBeNull();
    expect(migrateLocalCameras({}, storage(null))).toBeNull();
  });
});
