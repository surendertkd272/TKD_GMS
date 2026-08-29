import { execSync } from 'node:child_process';
import path from 'node:path';
import { testDatabaseUrl } from './db-url';

/** Runs once before the whole suite: pushes the schema into an isolated `test` schema. */
export async function setup() {
  process.loadEnvFile();
  const databaseUrl = testDatabaseUrl(process.env.DATABASE_URL!);

  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: path.resolve(import.meta.dirname, '../..'),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });
}
