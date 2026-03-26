/**
 * Test cases for Solr Standard Query Parser term queries → OpenSearch transformation.
 *
 * These tests validate the query-engine's ability to parse and transform
 * Solr's field:value syntax into OpenSearch term and exists queries.
 *
 * Adding a new test: just add a solrTest() entry below.
 * It automatically runs against every Solr version in matrix.config.ts.
 */
import { solrTest } from '../../../test-types';
import type { TestCase } from '../../../test-types';

export const testCases: TestCase[] = [
  // ───────────────────────────────────────────────────────────
  // Term queries
  // ───────────────────────────────────────────────────────────
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
];
