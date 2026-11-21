import { describe, expect, it } from 'vitest';
import { usableRoots } from './certificates';

// Self-signed test certificates (no private keys kept), one of each kind.
const RSA_CA = `-----BEGIN CERTIFICATE-----
MIICADCCAWmgAwIBAgIUFusnvHpdeZw15A6udJD/XZc23W8wDQYJKoZIhvcNAQEL
BQAwETEPMA0GA1UEAwwGcnNhLWNhMCAXDTI2MTEyMTAxMDE1NloYDzIxMjYxMDI4
MDEwMTU2WjARMQ8wDQYDVQQDDAZyc2EtY2EwgZ8wDQYJKoZIhvcNAQEBBQADgY0A
MIGJAoGBAMRIx3apXIboLpyQVjy9Vd2rVrh6yC9n6CAKpxKAsLjYjHdvbVujXYwl
A7ProZ2wBlft3lR6Z8G91vbi1hNVjf6wwj4ivKFK/7A11sN5IchOl1ZeVD9dBAgG
daP3AhZh7DUpQikM9m5Jh8eODE8bclLT5+F04InmpEJxmxdYY1UzAgMBAAGjUzBR
MB0GA1UdDgQWBBTlicSAuCM8AEH7j01qPSX6qgSh+zAfBgNVHSMEGDAWgBTlicSA
uCM8AEH7j01qPSX6qgSh+zAPBgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUA
A4GBAJxvJ41QQ9Z4yPXWT0bA9DY9vyexM4leLt1XRtsHODxvxuspxIFnJ7whYADu
hpAnqP+ZsPnjX8W23pZzCFcdmJ7/nivecK6aLUYJxJbAX0svYGMVswi7qdjHXi/M
GK0UDzny7nBaSj3UxO5KayoGJ9XHfcIJ21rOtXHtcYAvsCiJ
-----END CERTIFICATE-----`;
const EC_CA = `-----BEGIN CERTIFICATE-----
MIIBeDCCAR2gAwIBAgIUFNh403uVmYT+rMEEjw0UkoYfAqswCgYIKoZIzj0EAwIw
EDEOMAwGA1UEAwwFZWMtY2EwIBcNMjYxMTIxMDEwMTU2WhgPMjEyNjEwMjgwMTAx
NTZaMBAxDjAMBgNVBAMMBWVjLWNhMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE
bCGEOCczhgW7ovOj/JCMQ+UuD4GbngMCUSGoQ/EnVqs8wkKLOxSETixGOOyu4luO
hgwmiKhEYIqz4Zr7wshIH6NTMFEwHQYDVR0OBBYEFEfCTifpeTPUw9QpP0dZcowu
q/HLMB8GA1UdIwQYMBaAFEfCTifpeTPUw9QpP0dZcowuq/HLMA8GA1UdEwEB/wQF
MAMBAf8wCgYIKoZIzj0EAwIDSQAwRgIhAPfAFF+iiqjLc6r1RZcuwmA7OmlrKhS2
X9UWsRu8rWV9AiEAnxS0f9RkDDv9PCDma8uU6WgEkmjE3rsR9kVkxEfDMXU=
-----END CERTIFICATE-----`;
const ED25519_CA = `-----BEGIN CERTIFICATE-----
MIIBNjCB6aADAgECAhQCImcylvh0v9FaykQCiOm03VlQADAFBgMrZXAwEDEOMAwG
A1UEAwwFZWQtY2EwIBcNMjYxMTIxMDEwMTU2WhgPMjEyNjEwMjgwMTAxNTZaMBAx
DjAMBgNVBAMMBWVkLWNhMCowBQYDK2VwAyEAPnX4XFPmr+P0nVFUDyo0SL+Pf6W9
byNfaTOzi/Hllg+jUzBRMB0GA1UdDgQWBBTr40bGkydiqP90NL25oZ0HiGT7CzAf
BgNVHSMEGDAWgBTr40bGkydiqP90NL25oZ0HiGT7CzAPBgNVHRMBAf8EBTADAQH/
MAUGAytlcANBAFir8DgwzWEvMDoTsJruSf8FQ8IRWWeqGtxnE/nnhDYV7pszj4/Z
p4fpVMX9uGp67w6lh4Y39Tzp/IqUFibq8QA=
-----END CERTIFICATE-----`;
const NOT_A_CA = `-----BEGIN CERTIFICATE-----
MIIB+TCCAWKgAwIBAgIUT4kpsrklue/xB4w7c9lvdPU+gqswDQYJKoZIhvcNAQEL
BQAwDzENMAsGA1UEAwwEbGVhZjAgFw0yNjExMjEwMTAxNDlaGA8yMTI2MTAyODAx
MDE0OVowDzENMAsGA1UEAwwEbGVhZjCBnzANBgkqhkiG9w0BAQEFAAOBjQAwgYkC
gYEA0UvSU+LRUFpsFtlRuksRcFZ3n4FNThBPK89WvKcglaQ2C8gvZYJEq8A/QcZF
gmwmqUPCf35NGj7B0TK57Y6Ttplbtx7SDJuN/xj6Sstlr3fnhmhyajLiJXcPcfPz
ZyXZ7ITzAB/+JTxrFJ0Up6ZUMSOcg6ohTYK3B4RZumsTlwUCAwEAAaNQME4wHQYD
VR0OBBYEFDciyjANz0ZIT36XBSkZyn6k9B0TMB8GA1UdIwQYMBaAFDciyjANz0ZI
T36XBSkZyn6k9B0TMAwGA1UdEwEB/wQCMAAwDQYJKoZIhvcNAQELBQADgYEAC8sF
6tAP3KS2QaOeQ21oHN9rSMhMQS3knS07sqcZU2sV/Rvh6lnrENP/7AMta8mXg9zX
6M3taO0X8DhJcAVoQ06r0N7n6Mqkd3KGoeHOWPpGW25zQuo7gwRbEzgYgFD10LR/
M2j6m1FR5pNuckSXtPtj550oap1SWa9VJl1AdWo=
-----END CERTIFICATE-----`;

describe('usableRoots (the Mac build’s trusted roots)', () => {
  it('keeps RSA and NIST-curve CAs, once each', () => {
    const kept = usableRoots([RSA_CA, EC_CA, RSA_CA].join('\n'));
    expect(kept).toEqual([RSA_CA, EC_CA]);
  });
  it('leaves out what mbedTLS can’t read (one such would make ffmpeg refuse the whole file)', () => {
    expect(usableRoots([ED25519_CA, RSA_CA].join('\n'))).toEqual([RSA_CA]);
  });
  it('leaves out certificates that aren’t CAs, and junk', () => {
    const junk = '-----BEGIN CERTIFICATE-----\nnot base64\n-----END CERTIFICATE-----';
    expect(usableRoots([NOT_A_CA, junk, EC_CA].join('\n'))).toEqual([EC_CA]);
    expect(usableRoots('')).toEqual([]);
  });
});
