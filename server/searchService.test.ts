import test from 'node:test';
import assert from 'node:assert/strict';
import db from '../db';
import { huntMerchants } from './searchService';

type MockResult = { title: string; description: string; url: string };

function createSearchClient(results: MockResult[]) {
  return async () => ({
    noResults: false,
    vqd: 'mock-vqd',
    results,
  });
}

function resetDb() {
  db.exec(`
    DELETE FROM leads;
    DELETE FROM merchants;
    DELETE FROM search_runs;
    DELETE FROM logs;
  `);
}

test.beforeEach(() => {
  resetDb();
});

test('two identical searches return zero net-new merchants on second run by default', async () => {
  const mockResults: MockResult[] = [
    {
      title: 'Alpha Boutique | Instagram',
      description: 'Contact +971500000001 alpha@example.com',
      url: 'https://instagram.com/alphaboutique',
    },
  ];

  const firstRun = await huntMerchants({
    keywords: 'Boutique',
    location: 'Dubai',
    maxResults: 5,
    searchClient: createSearchClient(mockResults) as any,
  });

  assert.equal(firstRun.newLeadsCount, 1);
  assert.equal(firstRun.merchants.length, 1);
  assert.equal(firstRun.excludedDuplicates, 0);

  const secondRun = await huntMerchants({
    keywords: 'Boutique',
    location: 'Dubai',
    maxResults: 5,
    searchClient: createSearchClient(mockResults) as any,
  });

  assert.equal(secondRun.newLeadsCount, 0);
  assert.equal(secondRun.merchants.length, 0);
  assert.equal(secondRun.excludedDuplicates, 1);
});

test('current-run duplicates are excluded before merchant creation', async () => {
  const mockResults: MockResult[] = [
    {
      title: 'Bravo Store - TikTok',
      description: 'Order now +971500000002 bravo@example.com',
      url: 'https://tiktok.com/@bravostore',
    },
    {
      title: 'Bravo Store - Deals',
      description: 'Order now +971500000002 bravo@example.com',
      url: 'https://example.com/bravo-store',
    },
  ];

  const run = await huntMerchants({
    keywords: 'Store',
    location: 'Dubai',
    maxResults: 5,
    searchClient: createSearchClient(mockResults) as any,
  });

  assert.equal(run.newLeadsCount, 1);
  assert.equal(run.merchants.length, 1);
  assert.equal(run.excludedDuplicates, 1);

  const merchantCount = (db.prepare('SELECT COUNT(*) AS count FROM merchants').get() as { count: number }).count;
  assert.equal(merchantCount, 1);
});
