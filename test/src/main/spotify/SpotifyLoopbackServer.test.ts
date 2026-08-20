import http from 'http';
import type { AddressInfo } from 'net';
import { describe, expect, it } from 'vitest';
import { SpotifyLoopbackServer } from '@main/spotify/auth/SpotifyLoopbackServer';

describe('SpotifyLoopbackServer (Full Adversarial Lifecycle & Boundary Tests)', () => {
  it('should automatically recover and bind to an ephemeral port if preferred port has EADDRINUSE collision', async () => {
    // 1. Occupy a port with a dummy server
    const dummyServer = http.createServer((_, res) => res.end('occupied'));
    const busyPort = await new Promise<number>((resolve) => {
      dummyServer.listen(0, '127.0.0.1', () => {
        resolve((dummyServer.address() as AddressInfo).port);
      });
    });

    try {
      const expectedState = 'port-collision-test-state';
      // 2. Request SpotifyLoopbackServer on the occupied port
      const loopback = await SpotifyLoopbackServer.create({
        expectedState,
        preferredPort: busyPort,
        timeoutMs: 5000
      });

      // Assert it fell back to a different port and is working!
      expect(loopback.port).toBeGreaterThan(0);
      expect(loopback.port).not.toBe(busyPort);

      const callbackPromise = loopback.waitForCallback();
      const res = await fetch(
        `http://127.0.0.1:${loopback.port}/callback?code=recovered-code&state=${expectedState}`
      );
      expect(res.status).toBe(200);

      const result = await callbackPromise;
      expect(result.code).toBe('recovered-code');

      await loopback.close();
    } finally {
      await new Promise<void>((resolve) => dummyServer.close(() => resolve()));
    }
  });

  it('should remain ALIVE after stray invalid-state requests and accept subsequent valid callback', async () => {
    const expectedState = 'good-cryptographic-state-777';
    const loopback = await SpotifyLoopbackServer.create({
      expectedState,
      preferredPort: 0,
      timeoutMs: 5000
    });

    const callbackPromise = loopback.waitForCallback();

    // 1. Attacker sends wrong state
    const badResponse = await fetch(
      `http://127.0.0.1:${loopback.port}/callback?code=bad-code&state=attacker-state`
    );
    expect(badResponse.status).toBe(400);

    // 2. Stray random probe
    const randomProbeResponse = await fetch(`http://127.0.0.1:${loopback.port}/favicon.ico`);
    expect(randomProbeResponse.status).toBe(404);

    // 3. Legitimate user callback
    const legitimateResponse = await fetch(
      `http://127.0.0.1:${loopback.port}/callback?code=legitimate-auth-code-888&state=${expectedState}`
    );
    expect(legitimateResponse.status).toBe(200);

    const result = await callbackPromise;
    expect(result.code).toBe('legitimate-auth-code-888');
  });

  it('should recover if a callback with valid state but missing code arrives, then subsequent valid callback arrives', async () => {
    const expectedState = 'state-missing-code-test';
    const loopback = await SpotifyLoopbackServer.create({
      expectedState,
      preferredPort: 0,
      timeoutMs: 5000
    });

    const callbackPromise = loopback.waitForCallback();

    // Valid state, but missing code param
    const noCodeResponse = await fetch(
      `http://127.0.0.1:${loopback.port}/callback?state=${expectedState}`
    );
    expect(noCodeResponse.status).toBe(400);

    // Now valid callback arrives
    const validResponse = await fetch(
      `http://127.0.0.1:${loopback.port}/callback?code=valid-code-now&state=${expectedState}`
    );
    expect(validResponse.status).toBe(200);

    const result = await callbackPromise;
    expect(result.code).toBe('valid-code-now');
  });

  it('should reject callback when user denies access with valid state', async () => {
    const expectedState = 'valid-user-state';
    const loopback = await SpotifyLoopbackServer.create({
      expectedState,
      preferredPort: 0,
      timeoutMs: 5000
    });

    const [response, callbackError] = await Promise.all([
      fetch(
        `http://127.0.0.1:${loopback.port}/callback?error=access_denied&state=${expectedState}`
      ),
      loopback.waitForCallback().catch((err: unknown) => err)
    ]);

    expect(response.status).toBe(200);
    expect(callbackError).toBeInstanceOf(Error);
    expect((callbackError as Error).message).toMatch(/denied by user/i);
  });

  it('should reject pending waitForCallback() if close() is invoked manually', async () => {
    const loopback = await SpotifyLoopbackServer.create({
      expectedState: 'test-close-state',
      preferredPort: 0,
      timeoutMs: 5000
    });

    const callbackPromise = loopback.waitForCallback();
    await loopback.close();

    await expect(callbackPromise).rejects.toThrow(/closed manually/i);
  });

  it('should immediately reject waitForCallback() if called after close()', async () => {
    const loopback = await SpotifyLoopbackServer.create({
      expectedState: 'test-close-first-state',
      preferredPort: 0,
      timeoutMs: 5000
    });

    await loopback.close();
    await expect(loopback.waitForCallback()).rejects.toThrow(/closed manually/i);
  });

  it('should be safe and idempotent to call close() multiple times after valid callback', async () => {
    const expectedState = 'multi-close-state';
    const loopback = await SpotifyLoopbackServer.create({
      expectedState,
      preferredPort: 0,
      timeoutMs: 5000
    });

    const callbackPromise = loopback.waitForCallback();
    await fetch(`http://127.0.0.1:${loopback.port}/callback?code=code-123&state=${expectedState}`);
    await callbackPromise;

    await expect(loopback.close()).resolves.toBeUndefined();
    await expect(loopback.close()).resolves.toBeUndefined();
  });
});
