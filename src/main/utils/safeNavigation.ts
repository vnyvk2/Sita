import path from 'path';
import { fileURLToPath } from 'url';
import { app } from 'electron';

/**
 * Validates whether an in-window navigation destination is within the application bundle (SEC-08).
 * Prevents window.location.href or rogue hyperlinks from redirecting Electron windows to arbitrary external sites.
 */
export function isAllowedAppNavigation(targetUrl: string): boolean {
  if (!targetUrl || typeof targetUrl !== 'string') return false;

  try {
    const parsed = new URL(targetUrl);

    // Allow Vite dev server origin in development
    if (process.env['ELECTRON_RENDERER_URL']) {
      try {
        const devOrigin = new URL(process.env['ELECTRON_RENDERER_URL']).origin;
        if (parsed.origin === devOrigin) {
          return true;
        }
      } catch {
        // ignore invalid dev url
      }
    }

    // Allow local file: URLs strictly within app directory in production
    if (parsed.protocol === 'file:') {
      const filePath = path.resolve(fileURLToPath(targetUrl));
      let appRoot = '';
      try {
        if (app?.getAppPath) {
          appRoot = path.resolve(app.getAppPath());
        }
      } catch {
        // app may not be ready in some test contexts
      }
      if (!appRoot) {
        appRoot = path.resolve(process.cwd());
      }

      const normAppRoot = appRoot.toLowerCase();
      const normFilePath = filePath.toLowerCase();

      if (normFilePath === normAppRoot) return true;
      const rel = path.relative(normAppRoot, normFilePath);
      const isInsideApp = !rel.startsWith('..') && !path.isAbsolute(rel);

      if (isInsideApp) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}
