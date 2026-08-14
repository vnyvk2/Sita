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
  BrowserWindow: vi.fn(),
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
  protocol: {
    registerSchemesAsPrivileged: vi.fn()
  }
}));

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
