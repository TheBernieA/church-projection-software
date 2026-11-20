import { describe, expect, it } from 'vitest';
import { FLV_HEADER, flvFrame, flvSequenceHeader } from './flv';

describe('FLV video tags', () => {
  it('starts with a video-only header', () => {
    expect(FLV_HEADER.subarray(0, 3).toString()).toBe('FLV');
    expect(FLV_HEADER[4]).toBe(1);
    expect(FLV_HEADER).toHaveLength(13);
  });

  it('wraps the sequence header and frames with their times', () => {
    const seq = flvSequenceHeader(new Uint8Array([1, 100, 0, 42]));
    expect(seq[0]).toBe(9);
    expect(seq.readUIntBE(1, 3)).toBe(9); // 5 bytes of video header + 4 of avcC
    expect([...seq.subarray(11, 16)]).toEqual([0x17, 0, 0, 0, 0]);
    expect(seq.readUInt32BE(seq.length - 4)).toBe(seq.length - 4);

    const key = flvFrame(new Uint8Array([9, 9, 9]), true, 2000);
    expect(key.readUIntBE(4, 3)).toBe(2000);
    expect([...key.subarray(11, 16)]).toEqual([0x17, 1, 0, 0, 0]);
    const delta = flvFrame(new Uint8Array([9]), false, 16_777_216 + 5); // past 24 bits
    expect(delta[11]).toBe(0x27);
    expect(delta.readUIntBE(4, 3)).toBe(5);
    expect(delta[7]).toBe(1);
  });
});
