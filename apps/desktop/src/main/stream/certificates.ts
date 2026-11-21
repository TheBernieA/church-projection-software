import { execFile } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { createServer } from 'node:net';

/**
 * Trusted root certificates for an ffmpeg built with mbedTLS (Lampstand's Mac build), which has
 * no trust store of its own. ffmpeg refuses the whole file if mbedTLS can't read any one
 * certificate in it, so only the kinds it reads are kept, and the file is tried before use.
 */

/** Curves mbedTLS reads in its default build (alongside RSA keys). */
const CURVES = new Set(['prime256v1', 'secp384r1', 'secp521r1']);

/**
 * Of a PEM bundle, the CA certificates mbedTLS can read (RSA, or ECDSA on the NIST curves),
 * each once. A future root of another kind (Ed25519, say) is left out, not fatal.
 */
export function usableRoots(pem: string): string[] {
  const blocks = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];
  const kept = new Map<string, string>();
  for (const block of blocks) {
    try {
      const cert = new X509Certificate(block);
      const key = cert.publicKey;
      const curve = key.asymmetricKeyDetails?.namedCurve;
      const readable =
        key.asymmetricKeyType === 'rsa' ||
        key.asymmetricKeyType === 'rsa-pss' ||
        (key.asymmetricKeyType === 'ec' && curve !== undefined && CURVES.has(curve));
      if (cert.ca && readable) kept.set(cert.fingerprint256, block);
    } catch {
      /* not a certificate Node can read either: leave it out */
    }
  }
  return [...kept.values()];
}

/**
 * Does this ffmpeg accept the CA file? ffmpeg reads it just after connecting, so it's pointed
 * at a local listener that hangs up at once: a file it can't read fails with its own message,
 * before the handshake. Unknown (it couldn't be run in time) counts as accepted.
 */
export function caFileLoads(ffmpeg: string, caFile: string): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer((socket) => socket.destroy());
    server.on('error', () => resolve(true));
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      execFile(
        ffmpeg,
        ['-hide_banner', '-nostdin', '-ca_file', caFile, '-i', `tls://127.0.0.1:${port}`],
        { timeout: 10_000 },
        (_err, _out, stderr) => {
          server.close();
          resolve(!/parse_file for CA cert/i.test(stderr));
        },
      );
    });
  });
}
