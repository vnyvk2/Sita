import { vi } from 'vitest';

// Mock Electron app globally for all tests
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => {
      if (name === 'userData') return '/mock/user/data';
      return '/mock/path';
    }),
    getAppPath: vi.fn(() => '/mock/app/path'),
    isPackaged: false,
    on: vi.fn(),
    whenReady: vi.fn(() => Promise.resolve())
  },
  BrowserWindow: vi.fn(),
  nativeImage: {
    createFromPath: vi.fn(() => ({
      isEmpty: vi.fn(() => false)
    }))
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn()
  }
}));
