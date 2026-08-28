import { execSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { TEST_DB_PATH, TEST_DATABASE_URL } from './db-url';

function removeTestDb() {
  for (const suffix of ['', '-journal']) {
    const file = TEST_DB_PATH + suffix;
    if (existsSync(file)) unlinkSync(file);
  }
}

/** Runs once before the whole suite: fresh SQLite file, schema pushed, no data. */
export async function setup() {
  removeTestDb();
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: path.resolve(import.meta.dirname, '../..'),
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'pipe',
  });
}

/** Runs once after the whole suite: leave no test artifact behind. */
export async function teardown() {
  removeTestDb();
}
