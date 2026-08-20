import http from 'http';
import type { AddressInfo } from 'net';
import logger from '../../logger';

export const DEFAULT_LOOPBACK_PORT = 43821;
export const DEFAULT_AUTH_TIMEOUT_MS = 120000; // 2 minutes

export interface LoopbackCallbackResult {
  code: string;
}

export interface LoopbackServerHandle {
  port: number;
  redirectUri: string;
  waitForCallback(): Promise<LoopbackCallbackResult>;
  close(): Promise<void>;
}

export class SpotifyLoopbackServer {
  /**
   * Spawns an ephemeral HTTP loopback server listening strictly on 127.0.0.1.
   *
   * Resilient to stray/malformed requests: invalid state or stray path probes
   * return HTTP 400/404 without destroying the pending authorization listener.
   */
  public static async create(options: {
    expectedState: string;
    preferredPort?: number;
    timeoutMs?: number;
  }): Promise<LoopbackServerHandle> {
    const preferredPort = options.preferredPort ?? DEFAULT_LOOPBACK_PORT;
    const timeoutMs = options.timeoutMs ?? DEFAULT_AUTH_TIMEOUT_MS;

    let server: http.Server | null = null;
    let timeoutTimer: NodeJS.Timeout | null = null;
    let isSettled = false;
    let isClosed = false;

    let callbackPromiseResolve: (res: LoopbackCallbackResult) => void;
    let callbackPromiseReject: (err: Error) => void;

    const callbackPromise = new Promise<LoopbackCallbackResult>((resolve, reject) => {
      callbackPromiseResolve = (res) => {
        if (!isSettled) {
          isSettled = true;
          resolve(res);
        }
      };
      callbackPromiseReject = (err) => {
        if (!isSettled) {
          isSettled = true;
          reject(err);
        }
      };
    });
    callbackPromise.catch(() => {});

    const closeServer = async (): Promise<void> => {
      if (isClosed) return;
      isClosed = true;

      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
      }

      if (server) {
        const s = server;
        server = null;
        await new Promise<void>((resolve) => {
          s.close(() => resolve());
        });
      }
    };

    server = http.createServer((req, res) => {
      if (!req.url || !req.url.startsWith('/callback')) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
        return;
      }

      const parsedUrl = new URL(req.url, `http://127.0.0.1:${port}`);
      const code = parsedUrl.searchParams.get('code');
      const state = parsedUrl.searchParams.get('state');
      const error = parsedUrl.searchParams.get('error');

      // 1. Check for CSRF / State Mismatch
      // IMPORTANT: Do NOT terminate the server on a stray invalid state request (prevents DoS).
      if (!state || state !== options.expectedState) {
        logger.warn('Spotify loopback server received request with invalid/missing state', {
          hasState: Boolean(state)
        });
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Security Error</title></head>
            <body style="font-family: sans-serif; text-align: center; padding: 50px; background: #121212; color: #fff;">
              <h2 style="color: #ff5555;">Security State Mismatch</h2>
              <p>Invalid OAuth state token. Possible CSRF attempt or expired link.</p>
            </body>
          </html>
        `);
        return;
      }

      // 2. User Denied Access or Spotify Returned Error with Valid State
      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Spotify Authorization Failed</title></head>
            <body style="font-family: sans-serif; text-align: center; padding: 50px; background: #121212; color: #fff;">
              <h2 style="color: #ff5555;">Authorization Denied</h2>
              <p>Spotify authorization was denied.</p>
              <p>You can close this tab and return to Nora.</p>
            </body>
          </html>
        `);
        void closeServer();
        callbackPromiseReject(new Error(`Spotify authorization denied by user: ${error}`));
        return;
      }

      // 3. Missing Code with Valid State
      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Missing Code</title></head>
            <body style="font-family: sans-serif; text-align: center; padding: 50px; background: #121212; color: #fff;">
              <h2 style="color: #ff5555;">Missing Authorization Code</h2>
            </body>
          </html>
        `);
        return;
      }

      // 4. Valid Authorization Code Received!
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <!DOCTYPE html>
        <html>
          <head><title>Spotify Connected</title></head>
          <body style="font-family: sans-serif; text-align: center; padding: 50px; background: #121212; color: #fff;">
            <h2 style="color: #1DB954;">✓ Connected to Spotify!</h2>
            <p>You may now close this browser window and return to Nora.</p>
          </body>
        </html>
      `);

      void closeServer();
      callbackPromiseResolve({ code });
    });

    const port = await new Promise<number>((resolve, reject) => {
      const startListening = (targetPort: number) => {
        const onError = (err: NodeJS.ErrnoException) => {
          if (err.code === 'EADDRINUSE' && targetPort !== 0) {
            logger.warn(
              `Spotify loopback port ${targetPort} in use, retrying with OS-assigned ephemeral port...`
            );
            server!.removeListener('listening', onListening);
            startListening(0);
          } else {
            reject(err);
          }
        };

        const onListening = () => {
          server!.removeListener('error', onError);
          const address = server!.address() as AddressInfo;
          resolve(address.port);
        };

        server!.once('error', onError);
        server!.once('listening', onListening);
        server!.listen(targetPort, '127.0.0.1');
      };

      startListening(preferredPort);
    });

    timeoutTimer = setTimeout(() => {
      void closeServer();
      callbackPromiseReject(new Error(`Spotify authorization timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    const redirectUri = `http://127.0.0.1:${port}/callback`;

    return {
      port,
      redirectUri,
      waitForCallback: () => callbackPromise,
      close: async () => {
        if (!isSettled) {
          callbackPromiseReject(new Error('Spotify authorization server closed manually'));
        }
        await closeServer();
      }
    };
  }
}
