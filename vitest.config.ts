import path from 'path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/**',
        'out/**',
        'dist/**',
        'build/**',
        'coverage/**',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData/**',
        'test/**'
      ]
    }
  },
  resolve: {
    alias: {
      // NOTE: never alias 'vitest' to its own package directory here. That resolves test files to
      // a second vitest instance without runner state, breaking suites with
      // "Cannot read properties of undefined (reading 'config')" and silently disabling vi.mock
      // module interception.
      '@renderer': path.resolve(__dirname, './src/renderer/src'),
      '@assets': path.resolve(__dirname, './src/renderer/src/assets'),
      '@common': path.resolve(__dirname, './src/common'),
      '@main': path.resolve(__dirname, './src/main'),
      '@db': path.resolve(__dirname, './src/main/db'),
      '@preload': path.resolve(__dirname, './src/preload'),
      '@types': path.resolve(__dirname, './src/types')
    }
  }
});
