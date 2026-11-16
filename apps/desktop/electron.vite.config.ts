import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  main: {
    build: {
      // Workspace packages are devDependencies so they get bundled; runtime deps stay external.
      externalizeDeps: true,
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
        },
      },
    },
  },
  preload: {
    build: {
      // Sandboxed preloads must be self-contained CommonJS bundles.
      externalizeDeps: false,
      isolatedEntries: true,
      rollupOptions: {
        input: {
          control: resolve(__dirname, 'src/preload/control.ts'),
          output: resolve(__dirname, 'src/preload/output.ts'),
          stream: resolve(__dirname, 'src/preload/stream.ts'),
        },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: {
          control: resolve(__dirname, 'src/renderer/control/index.html'),
          output: resolve(__dirname, 'src/renderer/output/index.html'),
          stage: resolve(__dirname, 'src/renderer/stage/index.html'),
          stream: resolve(__dirname, 'src/renderer/stream/index.html'),
        },
      },
    },
  },
});
