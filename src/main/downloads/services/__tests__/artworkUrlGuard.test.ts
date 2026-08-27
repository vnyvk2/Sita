import { describe, expect, it, vi } from 'vitest';

import {
  assertUrlResolvesToPublicHost,
  isPubliclyRoutableAddress,
  UnsafeUrlError
} from '../artworkUrlGuard';

const publicLookup = vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]);

describe('isPubliclyRoutableAddress', () => {
  it('accepts public IPv4 addresses', () => {
    expect(isPubliclyRoutableAddress('93.184.216.34')).toBe(true);
    expect(isPubliclyRoutableAddress('1.1.1.1')).toBe(true);
    expect(isPubliclyRoutableAddress('172.15.255.255')).toBe(true);
    expect(isPubliclyRoutableAddress('172.32.0.1')).toBe(true);
    expect(isPubliclyRoutableAddress('100.63.255.255')).toBe(true);
    expect(isPubliclyRoutableAddress('100.128.0.0')).toBe(true);
  });

  it('rejects loopback, private, link-local and reserved IPv4 ranges', () => {
    const rejected = [
      '0.0.0.0',
      '0.1.2.3',
      '10.0.0.1',
      '127.0.0.1',
      '169.254.169.254', // cloud metadata endpoint
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '100.64.0.1', // CGNAT
      '192.0.2.9', // TEST-NET-1
      '198.18.0.5', // benchmarking
      '198.51.100.7', // TEST-NET-2
      '203.0.113.9', // TEST-NET-3
      '224.0.0.1', // multicast
      '239.255.255.255',
      '240.0.0.1', // reserved
      '255.255.255.255' // broadcast
    ];
    for (const ip of rejected) {
      expect(isPubliclyRoutableAddress(ip), ip).toBe(false);
    }
  });

  it('rejects malformed addresses', () => {
    expect(isPubliclyRoutableAddress('not-an-ip')).toBe(false);
    expect(isPubliclyRoutableAddress('999.1.1.1')).toBe(false);
    expect(isPubliclyRoutableAddress('1.2.3')).toBe(false);
  });

  it('accepts global unicast IPv6 and rejects special-purpose ranges', () => {
    expect(isPubliclyRoutableAddress('2606:2800:220:1:248:1893:25c8:1946')).toBe(true);

    const rejected = [
      '::', // unspecified
      '::1', // loopback
      'fe80::1', // link-local
      'fd00::1', // unique local
      'ff02::1', // multicast
      '100::1', // discard-only
      '2001:db8::1' // documentation
    ];
    for (const ip of rejected) {
      expect(isPubliclyRoutableAddress(ip), ip).toBe(false);
    }
  });

  it('applies IPv4 rules to embedded IPv6 forms', () => {
    expect(isPubliclyRoutableAddress('::ffff:127.0.0.1')).toBe(false);
    expect(isPubliclyRoutableAddress('::ffff:10.0.0.1')).toBe(false);
    expect(isPubliclyRoutableAddress('::ffff:93.184.216.34')).toBe(true);
    expect(isPubliclyRoutableAddress('64:ff9b::7f00:1')).toBe(false); // NAT64 -> 127.0.0.1
    expect(isPubliclyRoutableAddress('64:ff9b::0a00:1')).toBe(false); // NAT64 -> 10.0.0.1
  });
});

describe('assertUrlResolvesToPublicHost', () => {
  it.each(['ftp://example.com/a.png', 'file:///etc/passwd', 'javascript:alert(1)', 'nora://local'])(
    'rejects disallowed protocol %s',
    async (url) => {
      await expect(assertUrlResolvesToPublicHost(url, publicLookup)).rejects.toThrow(
        UnsafeUrlError
      );
    }
  );

  it('rejects malformed URLs', async () => {
    await expect(assertUrlResolvesToPublicHost('not a url', publicLookup)).rejects.toThrow(
      UnsafeUrlError
    );
  });

  it('accepts http(s) URLs with public IP literals without DNS lookup', async () => {
    await expect(
      assertUrlResolvesToPublicHost('https://93.184.216.34/art.png', publicLookup)
    ).resolves.toBeInstanceOf(URL);
    expect(publicLookup).not.toHaveBeenCalled();
  });

  it('rejects non-public IP literal hosts', async () => {
    for (const host of ['127.0.0.1', '[::1]', '192.168.0.10', '169.254.169.254']) {
      await expect(
        assertUrlResolvesToPublicHost(`http://${host}/internal`, publicLookup)
      ).rejects.toThrow(UnsafeUrlError);
    }
    expect(publicLookup).not.toHaveBeenCalled();
  });

  it('accepts hostnames that resolve exclusively to public addresses', async () => {
    publicLookup.mockResolvedValueOnce([
      { address: '93.184.216.34', family: 4 },
      { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 }
    ]);
    await expect(
      assertUrlResolvesToPublicHost('https://cdn.example.com/art.png', publicLookup)
    ).resolves.toBeInstanceOf(URL);
  });

  it('rejects when any resolved address is non-public (round-robin slip)', async () => {
    publicLookup.mockResolvedValueOnce([
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.5', family: 4 }
    ]);
    await expect(
      assertUrlResolvesToPublicHost('http://evil.example.com/art.png', publicLookup)
    ).rejects.toThrow(/non-public address/);
  });

  it('rejects unresolvable and empty-resolving hostnames', async () => {
    publicLookup.mockRejectedValueOnce(new Error('ENOTFOUND'));
    await expect(
      assertUrlResolvesToPublicHost('http://missing.example.com/a.png', publicLookup)
    ).rejects.toThrow(UnsafeUrlError);

    publicLookup.mockResolvedValueOnce([]);
    await expect(
      assertUrlResolvesToPublicHost('http://empty.example.com/a.png', publicLookup)
    ).rejects.toThrow(UnsafeUrlError);
  });
});
