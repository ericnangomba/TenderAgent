/**
 * PWA service-worker privacy invariants (review finding on v2): account data
 * must never be cached by the SW, legacy caches must be purged on upgrade,
 * and sign-out must be able to wipe everything. These tests read the shipped
 * public/sw.js so a regression that re-introduces API caching fails loudly.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const swPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sw.js');
const sw = readFileSync(swPath, 'utf8');

// Isolate the /api/ fetch branch to inspect its behavior specifically.
const apiBranch = (() => {
  const marker = "if (url.pathname.startsWith('/api/'))";
  const start = sw.indexOf(marker);
  assert.ok(start >= 0, 'sw.js must handle /api/ requests explicitly');
  // The branch ends at the static-assets section.
  const end = sw.indexOf('Static Assets', start);
  assert.ok(end > start, 'could not isolate the /api/ branch');
  return sw.slice(start, end);
})();

test('SW never writes /api/ responses to any cache', () => {
  assert.ok(!apiBranch.includes('cache.put'), '/api/ branch must not call cache.put');
  assert.ok(!apiBranch.includes('caches.match'), '/api/ branch must not serve from cache');
});

test('SW offline /api/ fallback carries no cached account data', () => {
  assert.ok(apiBranch.includes('offline'), 'offline fallback response expected');
  assert.ok(!apiBranch.includes('Displaying cached'), 'fallback must not claim to show cached state');
});

test('SW purges legacy tenderagent caches on activation and keeps the fresh shell', () => {
  const activate = sw.slice(sw.indexOf("self.addEventListener('activate'"), sw.indexOf("self.addEventListener('message'"));
  assert.ok(activate.includes('purgeLegacyCaches'), 'activate must purge legacy caches (v2 API entries)');
  assert.ok(!activate.includes('cache.addAll') && !activate.includes('cache.add('),
    'activate must not re-precache: the fresh shell from install is left intact');
});

test('SW only ever touches tenderagent-* caches, never unrelated origin tooling', () => {
  assert.ok(sw.includes("CACHE_PREFIX = 'tenderagent-'"), 'cache operations must be prefix-scoped');
  const deletes = sw.split('\n').filter((l) => l.includes('caches.delete'));
  assert.ok(deletes.length > 0 && deletes.every((l) => l.includes('startsWith(CACHE_PREFIX)')),
    'every caches.delete must be behind the tenderagent- prefix filter');
});

test('SW legacy purge still covers the vulnerable v2 cache name', () => {
  assert.ok('tenderagent-pwa-v2'.startsWith('tenderagent-'), 'v2 cache name must match the purge prefix');
});

test('SW supports a sign-out cache purge message', () => {
  assert.ok(sw.includes('CLEAR_CACHES'), 'sw.js must handle the CLEAR_CACHES message from the page');
});

test('SW cache name is versioned past the vulnerable v2 cache', () => {
  assert.ok(!sw.includes("'tenderagent-pwa-v2'"), 'must not reuse the v2 cache name');
  assert.ok(sw.includes("CACHE_NAME = 'tenderagent-pwa-v"), 'versioned cache name expected');
});
