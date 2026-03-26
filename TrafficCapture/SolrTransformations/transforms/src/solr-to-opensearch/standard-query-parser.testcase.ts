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

  solrTest('query-term-single-field', {
    description: 'Simple term query on a keyword field',
    documents: [
      { id: '1', title: 'laptop', category: 'electronics' },
      { id: '2', title: 'phone', category: 'electronics' },
      { id: '3', title: 'shirt', category: 'clothing' },
    ],
    requestPath: '/solr/testcollection/select?q=category:electronics&wt=json',
    solrSchema: {
      fields: {
        title: { type: 'text_general' },
        category: { type: 'text_general' },
      },
    },
    opensearchMapping: {
      properties: {
        title: { type: 'text' },
        category: { type: 'text' },
      },
    },
  }),
    
  solrTest('query-phrase', {
    description: 'Phrase query matching exact sequence',
    documents: [
      { id: '1', title: 'hello world', content: 'greeting message' },
      { id: '2', title: 'world hello', content: 'reversed greeting' },
      { id: '3', title: 'hello there world', content: 'split greeting' },
    ],
    requestPath: '/solr/testcollection/select?q=' + encodeURIComponent('title:"hello world"') + '&wt=json',
    solrSchema: {
      fields: {
        title: { type: 'text_general' },
        content: { type: 'text_general' },
      },
    },
    opensearchMapping: {
      properties: {
        title: { type: 'text' },
        content: { type: 'text' },
      },
    },
  }),

  // ───────────────────────────────────────────────────────────
  // Bare term and phrase queries (no field prefix, uses default field)
  // ───────────────────────────────────────────────────────────

  solrTest('query-bare-term', {
    description: 'Bare term query without field prefix (uses default field)',
    documents: [
      { id: '1', title: 'java programming', content: 'learn java basics' },
      { id: '2', title: 'python scripting', content: 'python for beginners' },
      { id: '3', title: 'javascript web', content: 'frontend development' },
    ],
    requestPath: '/solr/testcollection/select?q=java&wt=json',
    solrSchema: {
      fields: {
        title: { type: 'text_general' },
        content: { type: 'text_general' },
      },
    },
    opensearchMapping: {
      properties: {
        title: { type: 'text' },
        content: { type: 'text' },
      },
    },
  }),

  solrTest('query-bare-phrase', {
    description: 'Bare phrase query without field prefix (uses default field)',
    documents: [
      { id: '1', title: 'hello world', content: 'greeting message' },
      { id: '2', title: 'world hello', content: 'reversed greeting' },
      { id: '3', title: 'hello there world', content: 'split greeting' },
    ],
    requestPath: '/solr/testcollection/select?q=' + encodeURIComponent('"hello world"') + '&wt=json',
    solrSchema: {
      fields: {
        title: { type: 'text_general' },
        content: { type: 'text_general' },
      },
    },
    opensearchMapping: {
      properties: {
        title: { type: 'text' },
        content: { type: 'text' },
      },
    },
  }),

  solrTest('query-bare-term-with-df', {
    description: 'Bare term query with explicit default field (df parameter)',
    documents: [
      { id: '1', title: 'java programming', content: 'learn basics' },
      { id: '2', title: 'python scripting', content: 'java for beginners' },
      { id: '3', title: 'javascript web', content: 'frontend development' },
    ],
    requestPath: '/solr/testcollection/select?q=java&df=content&wt=json',
    solrSchema: {
      fields: {
        title: { type: 'text_general' },
        content: { type: 'text_general' },
      },
    },
    opensearchMapping: {
      properties: {
        title: { type: 'text' },
        content: { type: 'text' },
      },
    },
  }),

  solrTest('query-bare-phrase-with-df', {
    description: 'Bare phrase query with explicit default field (df parameter)',
    documents: [
      { id: '1', title: 'hello world', content: 'greeting message' },
      { id: '2', title: 'world hello', content: 'hello world reversed' },
      { id: '3', title: 'hello there world', content: 'split greeting' },
    ],
    requestPath: '/solr/testcollection/select?q=' + encodeURIComponent('"hello world"') + '&df=content&wt=json',
    solrSchema: {
      fields: {
        title: { type: 'text_general' },
        content: { type: 'text_general' },
      },
    },
    opensearchMapping: {
      properties: {
        title: { type: 'text' },
        content: { type: 'text' },
      },
    },
  }),
];
