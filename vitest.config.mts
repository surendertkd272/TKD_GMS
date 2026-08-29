import { defineConfig } from 'vitest/config';
import path from 'node:path';

process.loadEnvFile();

// Duplicated (not imported) from src/test/db-url.ts: the native Vite config loader
// applies stricter ESM/extension rules than the app's own tsconfig, so this file
// deliberately avoids importing a plain .ts sibling. Tests run in an isolated `test`
// schema on the same Postgres server as local dev — see src/test/global-setup.ts.
const testUrl = new URL(process.env.DATABASE_URL!);
testUrl.searchParams.set('schema', 'test');
const TEST_DATABASE_URL = testUrl.toString();

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      // Next resolves this to a no-op under its "react-server" export condition;
      // outside Next's bundler it throws by design, so alias it to the same no-op.
      'server-only': path.resolve(import.meta.dirname, 'node_modules/server-only/empty.js'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    env: { DATABASE_URL: TEST_DATABASE_URL },
    globalSetup: ['./src/test/global-setup.ts'],
  },
});
