import { createServer } from 'node:net';
import { describe, expect, it } from 'vitest';
import { anyReachable, endpointOf } from './reachability';

describe('reachability (reconnecting after a drop)', () => {
  it('finds the server of an RTMP address, without its key', () => {
    expect(endpointOf('rtmp://a.rtmp.youtube.com/live2/abcd-efgh-ijkl')).toEqual({
      host: 'a.rtmp.youtube.com',
      port: 1935,
    });
    expect(endpointOf('rtmps://live-api-s.facebook.com:443/rtmp/KEY')).toEqual({
      host: 'live-api-s.facebook.com',
      port: 443,
    });
    expect(endpointOf('rtmp://192.168.1.20:19350/live/test')).toEqual({
      host: '192.168.1.20',
      port: 19350,
    });
  });
  it("can't check SRT, UDP or nonsense (those are just retried)", () => {
    expect(endpointOf('srt://host:9000?streamid=x')).toBeNull();
    expect(endpointOf('udp://239.0.0.1:1234')).toBeNull();
    expect(endpointOf('not a url')).toBeNull();
  });
  it('says whether any server answers', async () => {
    const server = createServer().listen(0, '127.0.0.1');
    await new Promise((r) => server.once('listening', r));
    const port = (server.address() as { port: number }).port;
    expect(await anyReachable([{ host: '127.0.0.1', port }])).toBe(true);
    server.close();
    await new Promise((r) => server.once('close', r));
    expect(await anyReachable([{ host: '127.0.0.1', port }], 500)).toBe(false);
    expect(await anyReachable([])).toBe(true);
  });
});
