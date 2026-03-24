/**
 * Test cases for Solr Standard Query Parser (Lucene) → OpenSearch transformation.
 *
 * These tests validate the query-engine's ability to parse and transform
 * Solr's standard query parser syntax into OpenSearch Query DSL.
 *
 * Adding a new test: just add a solrTest() entry below.
 * It automatically runs against every Solr version in matrix.config.ts.
 *
 * Each test case defines:
 * - solrSchema: the Solr collection's field types (applied via Schema API)
 * - opensearchMapping: the corresponding OpenSearch index mapping
 * - documents: data seeded into both backends
 * - requestPath: the Solr query to test
 * - assertionRules: expected differences from Solr (everything else must match exactly)
 */
import { solrTest } from '../test-types';
import type { TestCase } from '../test-types';

export const testCases: TestCase[] = [
  // ───────────────────────────────────────────────────────────
  // Range queries
  // ───────────────────────────────────────────────────────────

  solrTest('query-range-inclusive-exclusive', {
    description: 'Range queries with inclusive and exclusive bounds',
    documents: [
      { id: '1', title: 'cheap low stock', price: 10, stock: 5 },
      { id: '2', title: 'mid good stock', price: 50, stock: 25 },
      { id: '3', title: 'expensive high stock', price: 100, stock: 50 },
      { id: '4', title: 'luxury item', price: 500, stock: 10 },
      { id: '5', title: 'free item', price: 0, stock: 100 },
    ],
    // price:[10 TO 100] AND stock:{0 TO 50}
    requestPath: '/solr/testcollection/select?q=' + encodeURIComponent('price:[10 TO 100] AND stock:{0 TO 50}') + '&wt=json',
    solrSchema: {
      fields: {
        title: { type: 'text_general' },
        price: { type: 'pint' },
        stock: { type: 'pint' },
      },
    },
    opensearchMapping: {
      properties: {
        title: { type: 'text' },
        price: { type: 'integer' },
        stock: { type: 'integer' },
      },
    },
  }),
];
