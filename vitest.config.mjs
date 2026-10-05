import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // Keep Windows test workers within the available memory during local development.
    maxWorkers: 1,
    environment: 'jsdom',
    globals: true,
    include: ['src/client/**/*.test.{js,jsx}'],
    setupFiles: './src/client/test/setup.js',
    css: false,
  },
});
