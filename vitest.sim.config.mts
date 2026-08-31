import { defineConfig } from 'vitest/config';
import path from 'node:path';

process.loadEnvFile();

/**
 * Same simulation, pointed at the development database instead of the isolated
 * `test` schema, so the seeded event can be browsed in the running app. It
 * creates its own Event and is removed with a single cascade delete.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      'server-only': path.resolve(import.meta.dirname, 'node_modules/server-only/empty.js'),
    },
  },
  test: {
    include: ['src/sim/**/*.test.ts'],
    env: { DATABASE_URL: process.env.DATABASE_URL!, DIRECT_URL: process.env.DIRECT_URL! },
    fileParallelism: false,
  },
});
