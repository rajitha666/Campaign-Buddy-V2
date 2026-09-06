import { defineConfig } from 'vitest/config';

/**
 * Unit tests for pure logic only (no React Native / Expo runtime).
 * Screen and navigation coverage is manual — see README "Testing".
 */
export default defineConfig({
  resolve: {
    alias: { '@': new URL('./src/', import.meta.url).pathname },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
