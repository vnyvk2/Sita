import fs from 'node:fs';
import { resolve } from 'path';
import type { Plugin } from 'vite';

const rootDir = fs.realpathSync(import.meta.dirname);
if (process.cwd() !== rootDir) {
  process.chdir(rootDir);
}

import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

/**
 * Injects a hardened CSP into production HTML bundles (SEC-02).
 * In development, Vite serves raw HTML permitting 'unsafe-inline' for HMR / React Refresh.
 */
function hardenedCspPlugin(): Plugin {
  return {
    name: 'hardened-csp-prod',
    apply: 'build',
    transformIndexHtml(html, ctx) {
      const isFloating = ctx.path.includes('floatingLyrics');
      const csp = isFloating
        ? "default-src 'self'; script-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: nora:; media-src 'self' blob: nora:; font-src 'self' data:; connect-src 'self' blob: nora:; worker-src 'self' blob:;"
        : "default-src 'self'; script-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: nora:; media-src 'self' blob: nora:; font-src 'self' data:; connect-src 'self' blob: nora: https://raw.githubusercontent.com; worker-src 'self' blob:;";

      return html.replace(
        /<meta[\s\S]*?http-equiv=["']Content-Security-Policy["'][\s\S]*?\/?>/i,
        `<meta http-equiv="Content-Security-Policy" content="${csp}" />`
      );
    }
  };
}

export default defineConfig(({ command }) => {
  const isProduction = command === 'build';

  return {
    main: {
      build: {
        sourcemap: !isProduction,
        minify: isProduction,
        rollupOptions: {
          input: {
            main: resolve(rootDir, 'src/main/main.ts'),
            mediaWorker: resolve(rootDir, 'src/main/workers/process/mediaWorker.ts')
          },
          output: {
            entryFileNames: '[name].js'
          },
          external: ['sharp']
        }
      },
      resolve: {
        alias: {
          '@db': resolve(rootDir, './src/main/db'),
          '@main': resolve(rootDir, './src/main'),
          '@common': resolve(rootDir, './src/common')
        }
      }
    },
    preload: {
      build: {
        sourcemap: !isProduction,
        minify: isProduction,
        rollupOptions: {
          input: {
            index: resolve(rootDir, 'src/preload/index.ts'),
            floatingLyrics: resolve(rootDir, 'src/preload/floatingLyricsPreload.ts')
          },
          output: { format: 'cjs', entryFileNames: '[name].cjs' }
        }
      }
    },
    renderer: {
      server: {
        fs: {
          strict: false
        }
      },
      build: {
        minify: true,
        sourcemap: !isProduction,
        rollupOptions: {
          input: {
            index: resolve(rootDir, 'src/renderer/index.html'),
            floatingLyrics: resolve(rootDir, 'src/renderer/floatingLyrics.html')
          }
        }
      },
      resolve: {
        alias: {
          '@renderer': resolve(rootDir, './src/renderer/src'),
          '@types': resolve(rootDir, './src/@types'),
          '@common': resolve(rootDir, './src/common'),
          '@assets': resolve(rootDir, './src/renderer/src/assets')
        }
      },
      plugins: [
        tanstackRouter({
          target: 'react',
          routesDirectory: 'src/routes',
          generatedRouteTree: 'src/routeTree.gen.ts',
          autoCodeSplitting: false,
          routeFileIgnorePattern: '.((test|spec).(js|jsx|ts|tsx))'
        }),
        react(),
        tailwindcss(),
        hardenedCspPlugin()
      ]
    }
  };
});
