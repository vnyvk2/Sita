import path from 'path';

import { app } from 'electron';

/**
 * Development-only isolation hook.
 *
 * Setting NORA_USER_DATA_DIR redirects Electron's userData directory BEFORE
 * any module boots (this import must stay first in main.ts), which redirects
 * nora.pglite.db and everything else derived from userData.
 *
 * Purpose: running a development build from a worktree against an isolated
 * database/library instead of the installed application's real data.
 * Hard-gated to non-packaged runs so it can never affect end users.
 */
const override = process.env.NORA_USER_DATA_DIR;
if (override && !app.isPackaged) {
  app.setPath('userData', path.resolve(override));
}
