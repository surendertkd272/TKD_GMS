/**
 * Tests run against the same Postgres server as local dev, but in an isolated
 * `test` schema (via the `schema` connection param) so resetDb() between tests
 * never touches real dev/demo data sitting in the `public` schema.
 */
export function testDatabaseUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set('schema', 'test');
  return url.toString();
}
