import path from 'node:path';

export const TEST_DB_PATH = path.resolve(import.meta.dirname, '../../prisma/test.db');
export const TEST_DATABASE_URL = `file:${TEST_DB_PATH}`;
