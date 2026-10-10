import fs from 'fs';
import path from 'path';

import { app } from 'electron';

/**
 * Development-only isolation hook + legacy userData preservation.
 *
 * Setting NORA_USER_DATA_DIR redirects Electron's userData directory BEFORE any module boots (this
 * import must stay first in main.ts), which redirects nora.sqlite.db and everything else derived
 * from userData.
 *
 * When packaged under productName "Sita", preserves an existing `%APPDATA%/nora` directory so the
 * installed app shares the same library database, song covers, and settings.
 */
const override = process.env.NORA_USER_DATA_DIR;
const isTest = typeof process.env.VITEST !== 'undefined' || process.env.NODE_ENV === 'test';
if (override && !app.isPackaged) {
  app.setPath('userData', path.resolve(override));
} else if (!isTest && typeof app?.getPath === 'function' && typeof app?.setPath === 'function') {
  try {
    const legacyUserData = path.join(app.getPath('appData'), 'nora');
    if (fs.existsSync(legacyUserData)) {
      app.setPath('userData', legacyUserData);
    }
  } catch {
    // Ignore in environments where appData path is unavailable
  }
}
