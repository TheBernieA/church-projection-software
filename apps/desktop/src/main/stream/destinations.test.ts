import { describe, expect, it } from 'vitest';
import type { StreamDestination } from '@lampstand/core';
import { DESTINATION_PROBLEMS, resolveDestinations } from './destinations';

const dest = (
  over: Partial<StreamDestination> & Pick<StreamDestination, 'id' | 'kind'>,
): StreamDestination => ({
  name: over.id,
  url: '',
  enabled: true,
  ...over,
});
const keys: Record<string, string> = {
  yt: 'abcd-1234-efgh-5678',
  bad: 'live2',
  fb: 'FB-1234567890123456',
};
const resolve = (
  destinations: StreamDestination[],
  alt: string[] = [],
  protocols = ['rtmp', 'rtmps', 'udp'],
) =>
  resolveDestinations({
    destinations,
    getKey: (id) => Promise.resolve(keys[id] ?? null),
    protocols,
    alt: new Set(alt),
  });

describe('where the stream goes', () => {
  it('builds each service address from its saved key, in order', async () => {
    const r = await resolve([
      dest({ id: 'yt', kind: 'youtube' }),
      dest({ id: 'fb', kind: 'facebook' }),
    ]);
    expect(r.urls).toEqual([
      'rtmps://a.rtmps.youtube.com:443/live2/abcd-1234-efgh-5678',
      'rtmps://live-api-s.facebook.com:443/rtmp/FB-1234567890123456',
    ]);
    expect(r.status.map((s) => s.state)).toEqual(['connecting', 'connecting']);
  });

  it('skips disabled ones, and fails those with no key or a key that cannot be right', async () => {
    const r = await resolve([
      dest({ id: 'off', kind: 'youtube', enabled: false }),
      dest({ id: 'nokey', kind: 'youtube' }),
      dest({ id: 'bad', kind: 'youtube' }),
    ]);
    expect(r.urls).toEqual([]);
    expect(r.status).toEqual([
      { id: 'nokey', name: 'nokey', state: 'failed' },
      { id: 'bad', name: 'bad', state: 'failed', reason: DESTINATION_PROBLEMS.key },
    ]);
  });

  it('uses a destination’s second address when asked', async () => {
    const r = await resolve([dest({ id: 'yt', kind: 'youtube' })], ['yt']);
    expect(r.urls).toEqual(['rtmp://a.rtmp.youtube.com/live2/abcd-1234-efgh-5678']);
  });

  it('takes a custom address with or without a key', async () => {
    const r = await resolve([dest({ id: 'c', kind: 'custom', url: 'rtmp://10.0.0.5/live/room' })]);
    expect(r.urls).toEqual(['rtmp://10.0.0.5/live/room']);
    expect((await resolve([dest({ id: 'c', kind: 'custom', url: 'http://nope' })])).urls).toEqual(
      [],
    );
  });

  it('checks a direct link’s address and that ffmpeg can send it', async () => {
    const r = await resolve([
      dest({ id: 'u', kind: 'direct', url: ' udp://192.168.1.50:9000 ' }),
      dest({ id: 's', kind: 'direct', url: 'srt://192.168.1.50:9000' }),
      dest({ id: 'x', kind: 'direct', url: 'udp://192.168.1.50' }),
    ]);
    expect(r.urls).toEqual(['udp://192.168.1.50:9000?pkt_size=1316']);
    expect(r.status.map((s) => s.reason)).toEqual([
      undefined,
      DESTINATION_PROBLEMS.noSrt,
      DESTINATION_PROBLEMS.address,
    ]);
  });

  it('never notes a key itself, only its length', async () => {
    const notes: unknown[] = [];
    await resolveDestinations({
      destinations: [dest({ id: 'yt', kind: 'youtube' })],
      getKey: () => Promise.resolve(keys.yt ?? null),
      protocols: [],
      alt: new Set(),
      onNote: (_e, info) => notes.push(info),
    });
    expect(JSON.stringify(notes)).not.toContain('abcd');
    expect(notes).toEqual([{ id: 'yt', kind: 'youtube', keyLength: 19 }]);
  });
});
