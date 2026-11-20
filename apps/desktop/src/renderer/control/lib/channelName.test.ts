import { describe, expect, it } from 'vitest';
import { channelName } from './utils';

describe('channelName', () => {
  it('keeps short names, and shortens long device names to what the mixer takes', () => {
    expect(channelName('USB Mic')).toBe('USB Mic');
    const long = channelName(
      'Microphone Array (Intel® Smart Sound Technology for Digital Microphones)',
    );
    expect(long.length).toBeLessThanOrEqual(40);
    expect(long.startsWith('Microphone Array (Intel')).toBe(true);
    expect(long.endsWith('…')).toBe(true);
    expect(channelName('   ')).toBe('Input');
  });
});
