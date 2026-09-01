import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Local runs read .env; CI sets the variables directly and has no such file.
try {
  process.loadEnvFile();
} catch {
  // no .env — the environment is already configured
}

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
