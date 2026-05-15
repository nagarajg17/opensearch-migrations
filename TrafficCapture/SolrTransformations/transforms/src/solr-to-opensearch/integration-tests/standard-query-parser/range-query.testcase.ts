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
import { solrTest } from '../../../test-types';
import type { TestCase } from '../../../test-types';

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

  solrTest('query-range-mixed-inclusive-exclusive', {
    description: 'Range query with inclusive lower and exclusive upper bound [10 TO 100}',
    documents: [
      { id: '1', title: 'item at lower bound', price: 10 },
      { id: '2', title: 'item in middle', price: 50 },
      { id: '3', title: 'item at upper bound', price: 100 },
      { id: '4', title: 'item above upper', price: 150 },
    ],
    // price:[10 TO 100} — includes 10, excludes 100
    requestPath: '/solr/testcollection/select?q=' + encodeURIComponent('price:[10 TO 100}') + '&wt=json',
    solrSchema: {
      fields: {
        title: { type: 'text_general' },
        price: { type: 'pint' },
      },
    },
    opensearchMapping: {
      properties: {
        title: { type: 'text' },
        price: { type: 'integer' },
      },
    },
  }),

  solrTest('query-range-unbounded-upper', {
    description: 'Range query with unbounded upper bound [10 TO *]',
    documents: [
      { id: '1', title: 'below threshold', price: 5 },
      { id: '2', title: 'at threshold', price: 10 },
      { id: '3', title: 'above threshold', price: 100 },
      { id: '4', title: 'way above', price: 1000 },
    ],
    // price:[10 TO *] — 10 and above
    requestPath: '/solr/testcollection/select?q=' + encodeURIComponent('price:[10 TO *]') + '&wt=json',
    solrSchema: {
      fields: {
        title: { type: 'text_general' },
        price: { type: 'pint' },
      },
    },
    opensearchMapping: {
      properties: {
        title: { type: 'text' },
        price: { type: 'integer' },
      },
    },
  }),

  solrTest('query-range-fully-unbounded-exists', {
    description: 'Range query [* TO *] matches documents where field exists',
    documents: [
      { id: '1', title: 'has price', price: 50 },
      { id: '2', title: 'also has price', price: 0 },
      { id: '3', title: 'no price field' },
    ],
    // price:[* TO *] — field exists check
    requestPath: '/solr/testcollection/select?q=' + encodeURIComponent('price:[* TO *]') + '&wt=json',
    solrSchema: {
      fields: {
        title: { type: 'text_general' },
        price: { type: 'pint' },
      },
    },
    opensearchMapping: {
      properties: {
        title: { type: 'text' },
        price: { type: 'integer' },
      },
    },
  }),

  // ───────────────────────────────────────────────────────────
  // Date range queries — ISO timestamp bounds
  // ───────────────────────────────────────────────────────────

  solrTest('query-range-date-inclusive', {
    description: 'Date range query with inclusive ISO timestamp bounds',
    documents: [
      { id: '1', title: 'before range',   event_date: '2024-01-01T00:00:00Z' },
      { id: '2', title: 'at lower bound', event_date: '2024-03-01T00:00:00Z' },
      { id: '3', title: 'in range',       event_date: '2024-06-15T12:00:00Z' },
      { id: '4', title: 'at upper bound', event_date: '2024-09-30T23:59:59Z' },
      { id: '5', title: 'after range',    event_date: '2024-12-31T00:00:00Z' },
    ],
    requestPath:
      '/solr/testcollection/select?q=' +
      encodeURIComponent('event_date:[2024-03-01T00:00:00Z TO 2024-09-30T23:59:59Z]') +
      '&wt=json',
    solrSchema: {
      fields: {
        title:      { type: 'text_general' },
        event_date: { type: 'pdate' },
      },
    },
    opensearchMapping: {
      properties: {
        title:      { type: 'text' },
        event_date: { type: 'date' },
      },
    },
  }),

  solrTest('query-range-date-exclusive', {
    description: 'Date range query with exclusive bounds {lower TO upper} — boundary docs must not match',
    documents: [
      { id: '1', title: 'at lower bound', event_date: '2024-01-01T00:00:00Z' },
      { id: '2', title: 'inside range',   event_date: '2024-04-01T00:00:00Z' },
      { id: '3', title: 'also inside',    event_date: '2024-08-01T00:00:00Z' },
      { id: '4', title: 'at upper bound', event_date: '2024-12-31T23:59:59Z' },
    ],
    requestPath:
      '/solr/testcollection/select?q=' +
      encodeURIComponent('event_date:{2024-01-01T00:00:00Z TO 2024-12-31T23:59:59Z}') +
      '&wt=json',
    solrSchema: {
      fields: {
        title:      { type: 'text_general' },
        event_date: { type: 'pdate' },
      },
    },
    opensearchMapping: {
      properties: {
        title:      { type: 'text' },
        event_date: { type: 'date' },
      },
    },
  }),

  solrTest('query-range-date-open-lower', {
    description: 'Date range with open lower bound [* TO upper] matches everything up to and including the upper',
    documents: [
      { id: '1', title: 'old event',      event_date: '2020-01-01T00:00:00Z' },
      { id: '2', title: 'mid event',      event_date: '2022-06-01T00:00:00Z' },
      { id: '3', title: 'at upper bound', event_date: '2024-12-31T23:59:59Z' },
      { id: '4', title: 'future event',   event_date: '2025-06-01T00:00:00Z' },
    ],
    requestPath:
      '/solr/testcollection/select?q=' +
      encodeURIComponent('event_date:[* TO 2024-12-31T23:59:59Z]') +
      '&wt=json',
    solrSchema: {
      fields: {
        title:      { type: 'text_general' },
        event_date: { type: 'pdate' },
      },
    },
    opensearchMapping: {
      properties: {
        title:      { type: 'text' },
        event_date: { type: 'date' },
      },
    },
  }),

  // ───────────────────────────────────────────────────────────
  // Date range queries — NOW date-math bounds
  // ───────────────────────────────────────────────────────────

  solrTest('query-range-date-now', {
    description: 'Date range [* TO NOW] matches past events and excludes future ones',
    documents: [
      { id: '1', title: 'old event',          event_date: '2020-01-01T00:00:00Z' },
      { id: '2', title: 'another past event', event_date: '2022-06-15T00:00:00Z' },
      { id: '3', title: 'near future event',  event_date: '2098-01-01T00:00:00Z' },
      { id: '4', title: 'far future event',   event_date: '2099-12-31T00:00:00Z' },
    ],
    requestPath:
      '/solr/testcollection/select?q=' +
      encodeURIComponent('event_date:[* TO NOW]') +
      '&wt=json',
    solrSchema: {
      fields: {
        title:      { type: 'text_general' },
        event_date: { type: 'pdate' },
      },
    },
    opensearchMapping: {
      properties: {
        title:      { type: 'text' },
        event_date: { type: 'date' },
      },
    },
  }),

  solrTest('query-range-date-now-minus-days', {
    description: 'Date range [NOW-30DAYS TO NOW] matches only recent events',
    documents: [
      { id: '1', title: 'very old event',  event_date: '2020-01-01T00:00:00Z' },
      { id: '2', title: 'old event',       event_date: '2022-06-15T00:00:00Z' },
      { id: '3', title: 'near future',     event_date: '2098-01-01T00:00:00Z' },
      { id: '4', title: 'far future',      event_date: '2099-12-31T00:00:00Z' },
    ],
    requestPath:
      '/solr/testcollection/select?q=' +
      encodeURIComponent('event_date:[NOW-30DAYS TO NOW]') +
      '&wt=json',
    solrSchema: {
      fields: {
        title:      { type: 'text_general' },
        event_date: { type: 'pdate' },
      },
    },
    opensearchMapping: {
      properties: {
        title:      { type: 'text' },
        event_date: { type: 'date' },
      },
    },
  }),

  solrTest('query-range-date-now-with-rounding', {
    description: 'Date range [NOW/DAY TO NOW+1DAY/DAY] covers the current day only',
    documents: [
      { id: '1', title: 'year 2020',   event_date: '2020-06-15T12:00:00Z' },
      { id: '2', title: 'year 2022',   event_date: '2022-06-15T12:00:00Z' },
      { id: '3', title: 'year 2098',   event_date: '2098-06-15T12:00:00Z' },
      { id: '4', title: 'year 2099',   event_date: '2099-06-15T12:00:00Z' },
    ],
    requestPath:
      '/solr/testcollection/select?q=' +
      encodeURIComponent('event_date:[NOW/DAY TO NOW+1DAY/DAY]') +
      '&wt=json',
    solrSchema: {
      fields: {
        title:      { type: 'text_general' },
        event_date: { type: 'pdate' },
      },
    },
    opensearchMapping: {
      properties: {
        title:      { type: 'text' },
        event_date: { type: 'date' },
      },
    },
  }),

  solrTest('query-range-date-anchored-date-math', {
    description:
      'Date math on a fixed ISO anchor: 2024-01-01T00:00:00Z+3MONTHS+5DAYS/DAY ' +
      'evaluates to 2024-04-06T00:00:00Z — used as lower bound to confirm anchored date math is translated correctly.',
    documents: [
      { id: '1', title: 'before anchor math result', event_date: '2024-01-01T00:00:00Z' },
      { id: '2', title: 'just before result',        event_date: '2024-04-05T23:59:59Z' },
      { id: '3', title: 'at result boundary',        event_date: '2024-04-06T00:00:00Z' },
      { id: '4', title: 'well after result',         event_date: '2024-12-31T00:00:00Z' },
    ],
    // Lower bound: 2024-01-01T00:00:00Z+3MONTHS+5DAYS/DAY = 2024-04-06T00:00:00Z
    requestPath:
      '/solr/testcollection/select?q=' +
      encodeURIComponent('event_date:[2024-01-01T00:00:00Z+3MONTHS+5DAYS/DAY TO *]') +
      '&sort=' + encodeURIComponent('id asc') +
      '&wt=json',
    solrSchema: {
      fields: {
        title:      { type: 'text_general' },
        event_date: { type: 'pdate' },
      },
    },
    opensearchMapping: {
      properties: {
        id:         { type: 'text' },
        title:      { type: 'text' },
        event_date: { type: 'date' },
      },
    },
  }),
];
