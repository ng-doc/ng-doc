import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// audit.mjs requires every route of this committed reference to still exist (less the documented
// removals), so a malformed list would silently weaken that check.
test('the committed baseline lists unique, sorted, absolute routes', async () => {
  const { routes, emptyBodyRoutes } = JSON.parse(
    await readFile(new URL('./baseline-routes.json', import.meta.url), 'utf8'),
  );
  assert.ok(Array.isArray(routes) && routes.length > 0);
  for (const route of routes) assert.match(route, /^\/[^\s?#]*$/);
  assert.equal(new Set(routes).size, routes.length);
  assert.deepEqual(routes, [...routes].sort());
  assert.ok(routes.includes('/'));
  // An empty documentation body is accepted only for a route whose body was already empty.
  assert.ok(Array.isArray(emptyBodyRoutes));
  for (const route of emptyBodyRoutes) assert.ok(routes.includes(route), route);
});
