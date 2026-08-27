import dns from 'node:dns/promises';
import net from 'node:net';

/**
 * SSRF guards for fetching renderer-supplied artwork URLs in the main process.
 *
 * A compromised or buggy renderer can hand the main process arbitrary URLs via IPC. Before any
 * outbound request is made, the destination must be proven publicly routable:
 *
 * - Only http/https schemes are allowed;
 * - IP-literal hosts are checked directly against non-routable ranges;
 * - Hostnames are resolved and EVERY resolved address must be public (defeats DNS round-robin
 *   slipping a private address through);
 * - Redirects are followed manually by the caller so each hop is re-validated.
 *
 * Residual risk (documented, accepted): a classic DNS-rebinding TOCTOU window remains because the
 * socket is not pinned to the validated address; closing it requires a custom dispatcher/agent
 * which Node's global fetch does not expose.
 */

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

export interface ResolvedAddress {
  address: string;
  family: number;
}

export type LookupFn = (hostname: string) => Promise<ResolvedAddress[]>;

const defaultLookup: LookupFn = (hostname) => dns.lookup(hostname, { all: true, verbatim: true });

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

function isPublicIPv4(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  const octets = parts.map(Number);
  if (octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) return false;
  const [a, b] = octets;

  if (a === 0) return false; // 0.0.0.0/8 "this network"
  if (a === 10) return false; // 10.0.0.0/8 private
  if (a === 127) return false; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return false; // 169.254.0.0/16 link-local (cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return false; // 172.16.0.0/12 private
  if (a === 192 && b === 168) return false; // 192.168.0.0/16 private
  if (a === 100 && b >= 64 && b <= 127) return false; // 100.64.0.0/10 CGNAT
  if (a === 192 && b === 0) return false; // 192.0.0.0/24 IETF + 192.0.2.0/24 TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return false; // 198.18.0.0/15 benchmarking
  if (a === 198 && b === 51) return false; // 198.51.100.0/24 TEST-NET-2
  if (a === 203 && b === 0) return false; // 203.0.113.0/24 TEST-NET-3
  if (a >= 224 && a <= 239) return false; // 224.0.0.0/4 multicast
  if (a >= 240) return false; // 240.0.0.0/4 reserved incl. broadcast

  return true;
}

/** Parses an IPv6 literal (including embedded IPv4 forms) into a BigInt. */
function ipv6ToBigInt(ip: string): bigint | null {
  let head = ip;
  let embeddedV4: string | null = null;

  const v4Match = head.match(/^(.*):(\d+\.\d+\.\d+\.\d+)$/);
  if (v4Match) {
    embeddedV4 = v4Match[2];
    // Substitute in place so any "::" compression marker survives.
    head = head.replace(/(\d+\.\d+\.\d+\.\d+)$/, '0:0');
  }

  const sections = head.split('::');
  if (sections.length > 2) return null;

  const left = sections[0] ? sections[0].split(':') : [];
  const right = sections.length === 2 && sections[1] ? sections[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (sections.length === 1 && missing !== 0)) return null;

  const groups = [
    ...left,
    ...Array.from({ length: sections.length === 2 ? missing : 0 }, () => '0'),
    ...right
  ];
  let value = 0n;
  for (const group of groups) {
    if (!/^[0-9A-Fa-f]{1,4}$/.test(group)) return null;
    value = (value << 16n) | BigInt(parseInt(group, 16));
  }

  if (embeddedV4) {
    const v4 = embeddedV4.split('.').map(Number);
    if (v4.length !== 4 || v4.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) return null;
    // The substituted "0:0" groups already occupy the low 32 bits.
    value |= BigInt(((v4[0] << 24) | (v4[1] << 16) | (v4[2] << 8) | v4[3]) >>> 0);
  }

  return value;
}

function isPublicIPv6(ip: string): boolean {
  const value = ipv6ToBigInt(ip);
  if (value === null) return false;

  // IPv4-mapped ::ffff:0:0/96 -> apply IPv4 rules to the embedded address.
  if (value >> 32n === 0xffffn) {
    const low32 = Number(value & 0xffffffffn);
    const v4 = [(low32 >>> 24) & 255, (low32 >>> 16) & 255, (low32 >>> 8) & 255, low32 & 255];
    return isPublicIPv4(v4.join('.'));
  }

  // NAT64 64:ff9b::/96 -> the destination ultimately lands on the embedded IPv4.
  if (value >> 96n === 0x64ff9bn) {
    const low32 = Number(value & 0xffffffffn);
    const v4 = [(low32 >>> 24) & 255, (low32 >>> 16) & 255, (low32 >>> 8) & 255, low32 & 255];
    return isPublicIPv4(v4.join('.'));
  }

  // Whitelist global unicast 2000::/3 only. This single rule rejects ::,
  // ::1, fc00::/7 (ULA), fe80::/10 (link-local), ff00::/8 (multicast),
  // 100::/64 (discard-only), and every other special-purpose range outside
  // global unicast by construction.
  const isGlobalUnicast = value >> 125n === 0x1n;
  if (!isGlobalUnicast) return false;

  // 2001:db8::/32 sits inside 2000::/3 but is reserved for documentation.
  if (value >> 96n === 0x20010db8n) return false;

  return true;
}

export function isPubliclyRoutableAddress(address: string): boolean {
  const version = net.isIP(address);
  if (version === 4) return isPublicIPv4(address);
  if (version === 6) return isPublicIPv6(address);
  return false;
}

/**
 * Asserts that `urlStr` is an http(s) URL whose host is (or resolves exclusively to) publicly
 * routable addresses. Throws `UnsafeUrlError` otherwise.
 */
export async function assertUrlResolvesToPublicHost(
  urlStr: string,
  lookup: LookupFn = defaultLookup
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    throw new UnsafeUrlError(`Malformed artwork URL: ${urlStr}`);
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new UnsafeUrlError(`Disallowed protocol: ${url.protocol}`);
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '');

  if (net.isIP(hostname)) {
    if (!isPubliclyRoutableAddress(hostname)) {
      throw new UnsafeUrlError(`Non-public IP literal: ${hostname}`);
    }
    return url;
  }

  let addresses: ResolvedAddress[];
  try {
    addresses = await lookup(hostname);
  } catch (error) {
    throw new UnsafeUrlError(`DNS resolution failed for ${hostname}: ${String(error)}`);
  }

  if (!addresses || addresses.length === 0) {
    throw new UnsafeUrlError(`No DNS records for ${hostname}`);
  }

  for (const { address } of addresses) {
    if (!isPubliclyRoutableAddress(address)) {
      throw new UnsafeUrlError(`${hostname} resolves to non-public address ${address}`);
    }
  }

  return url;
}
