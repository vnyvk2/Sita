import { vi, afterEach } from 'vitest';

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
    getAllDisplays: vi.fn(() => [
      {
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1040 }
      }
    ]),
    getDisplayMatching: vi.fn(() => ({
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1040 }
    })),
    on: vi.fn()
  },
  utilityProcess: {
    fork: vi.fn()
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

export class SetupMockAudioParam {
  value: number;
  setValueAtTime = vi.fn(function (this: any, val: number) {
    this.value = val;
    return this;
  });
  setTargetAtTime = vi.fn(function (this: any, val: number) {
    this.value = val;
    return this;
  });
  linearRampToValueAtTime = vi.fn(function (this: any, val: number) {
    this.value = val;
    return this;
  });
  exponentialRampToValueAtTime = vi.fn(function (this: any, val: number) {
    this.value = val;
    return this;
  });
  setValueCurveAtTime = vi.fn(function (this: any) {
    return this;
  });
  cancelScheduledValues = vi.fn(function (this: any) {
    return this;
  });
  cancelAndHoldAtTime = vi.fn(function (this: any) {
    return this;
  });

  constructor(initial = 0) {
    this.value = initial;
  }
}

export class SetupMockAudioContext {
  currentTime = 0;
  state = 'running';
  destination = { channelCount: 2 };

  createGain() {
    return {
      gain: new SetupMockAudioParam(1),
      channelCount: 2,
      channelCountMode: 'max',
      channelInterpretation: 'speakers',
      connect: vi.fn().mockReturnThis(),
      disconnect: vi.fn()
    };
  }

  createChannelSplitter() {
    return { connect: vi.fn().mockReturnThis(), disconnect: vi.fn() };
  }

  createChannelMerger() {
    return { connect: vi.fn().mockReturnThis(), disconnect: vi.fn() };
  }

  createBiquadFilter() {
    return {
      frequency: new SetupMockAudioParam(1000),
      Q: new SetupMockAudioParam(1),
      gain: new SetupMockAudioParam(0),
      type: 'peaking',
      connect: vi.fn().mockReturnThis(),
      disconnect: vi.fn()
    };
  }

  createDynamicsCompressor() {
    return {
      threshold: new SetupMockAudioParam(-24),
      knee: new SetupMockAudioParam(30),
      ratio: new SetupMockAudioParam(12),
      attack: new SetupMockAudioParam(0.003),
      release: new SetupMockAudioParam(0.25),
      reduction: 0,
      connect: vi.fn().mockReturnThis(),
      disconnect: vi.fn()
    };
  }

  createMediaElementSource() {
    return { connect: vi.fn().mockReturnThis(), disconnect: vi.fn() };
  }

  createConvolver() {
    return { buffer: null, connect: vi.fn().mockReturnThis(), disconnect: vi.fn() };
  }

  createBuffer(channels: number, length: number, sampleRate: number) {
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      getChannelData: vi.fn(() => new Float32Array(length))
    };
  }

  resume() {
    this.state = 'running';
    return Promise.resolve();
  }

  suspend() {
    this.state = 'suspended';
    return Promise.resolve();
  }

  close() {
    return Promise.resolve();
  }
}

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
    },
    // store.ts invokes this during module initialization; provide a no-op for suites that do not
    // stub the full preload bridge
    storageHelpers: {
      checkLocalStorage: vi.fn()
    },
    userData: {
      saveUserData: vi.fn().mockResolvedValue(undefined)
    }
  };

  window.AudioContext = SetupMockAudioContext as any;
  (window as any).webkitAudioContext = SetupMockAudioContext as any;
}

const defaultAudioContext = typeof window !== 'undefined' ? window.AudioContext : undefined;

afterEach(() => {
  if (typeof window !== 'undefined' && defaultAudioContext) {
    window.AudioContext = defaultAudioContext;
    (window as any).webkitAudioContext = defaultAudioContext;
  }
});
