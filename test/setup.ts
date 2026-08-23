import { vi } from 'vitest';

// Mock Electron app globally for all tests
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => {
      if (name === 'userData') return '/mock/user/data';
      return '/mock/path';
    }),
    getAppPath: vi.fn(() => process.cwd()),
    isPackaged: false,
    getVersion: vi.fn(() => '1.0.0'),
    requestSingleInstanceLock: vi.fn(() => true),
    on: vi.fn(),
    whenReady: vi.fn(() => Promise.resolve())
  },
  BrowserWindow: Object.assign(vi.fn(), {
    getAllWindows: vi.fn(() => []),
    fromWebContents: vi.fn()
  }),
  nativeImage: {
    createFromPath: vi.fn(() => ({
      isEmpty: vi.fn(() => false),
      resize: vi.fn(() => ({}))
    }))
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn()
  },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => false),
    encryptString: vi.fn((str: string) => Buffer.from(str)),
    decryptString: vi.fn((buf: Buffer) => buf.toString())
  },
  protocol: {
    registerSchemesAsPrivileged: vi.fn()
  },
  net: {
    isOnline: vi.fn(() => true)
  },
  screen: {
    getAllDisplays: vi.fn(() => []),
    getDisplayMatching: vi.fn(() => ({
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1040 }
    })),
    on: vi.fn()
  }
}));

process.env.MAIN_VITE_ENCRYPTION_SECRET = 'nora_test_secret_key_1234567890123456';

vi.mock('electron-updater', () => {
  const mockAutoUpdater = {
    autoDownload: false,
    on: vi.fn(),
    checkForUpdatesAndNotify: vi.fn()
  };
  return {
    default: {
      autoUpdater: mockAutoUpdater
    },
    autoUpdater: mockAutoUpdater
  };
});

if (typeof window !== 'undefined') {
  (window as unknown as { api?: unknown }).api = {
    log: {
      sendLogs: vi.fn()
    },
    properties: {
      isInDevelopment: false
    },
    settings: {
      getUserSettings: vi.fn().mockResolvedValue({})
    }
  };
}
