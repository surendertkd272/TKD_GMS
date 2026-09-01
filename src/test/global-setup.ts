import { execSync } from 'node:child_process';
import path from 'node:path';
import { testDatabaseUrl } from './db-url';

/** Runs once before the whole suite: pushes the schema into an isolated `test` schema. */
export async function setup() {
  // Local runs read .env; CI sets the variables directly and has no such file.
  try {
    process.loadEnvFile();
  } catch {
    // no .env — the environment is already configured
  }
  const databaseUrl = testDatabaseUrl(process.env.DATABASE_URL!);

  // DIRECT_URL matters too: schema.prisma declares it, so the CLI pushes DDL
  // through that connection — leaving it pointed at `public` would create the
  // tables in the wrong schema.
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: path.resolve(import.meta.dirname, '../..'),
    env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl },
    stdio: 'pipe',
  });
}
