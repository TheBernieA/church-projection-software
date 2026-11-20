import { describe, expect, it } from 'vitest';
import { findNdiRuntime, fourCC, toPlanar } from './ndiRuntime';

describe('NDI runtime', () => {
  it('finds the runtime NDI Tools installs, or nothing', () => {
    const has = (paths: string[]) => (p: string) => paths.includes(p);
    expect(findNdiRuntime({}, 'darwin', has([]), () => [])).toBeNull();
    expect(
      findNdiRuntime({}, 'darwin', has(['/usr/local/lib/libndi.dylib']), (d) =>
        d === '/usr/local/lib' ? ['libndi.dylib', 'other.dylib'] : [],
      ),
    ).toBe('/usr/local/lib/libndi.dylib');
    expect(
      findNdiRuntime(
        { NDI_RUNTIME_DIR_V6: 'C:\\NDI' },
        'win32',
        (p) => p.endsWith('Processing.NDI.Lib.x64.dll'),
        () => [],
      ),
    ).toMatch(/Processing\.NDI\.Lib\.x64\.dll$/);
    // An explicit path wins.
    expect(
      findNdiRuntime(
        { LAMPSTAND_NDI_LIB: '/x/libndi.so' },
        'linux',
        () => true,
        () => [],
      ),
    ).toBe('/x/libndi.so');
  });

  it("makes NDI's four-character codes", () => {
    expect(fourCC('BGRA')).toBe(0x41524742);
    expect(fourCC('FLTp')).toBe(0x70544c46);
  });

  it('turns interleaved stereo into planar', () => {
    expect([...toPlanar(new Float32Array([1, -1, 2, -2, 3, -3]))]).toEqual([1, 2, 3, -1, -2, -3]);
  });
});
