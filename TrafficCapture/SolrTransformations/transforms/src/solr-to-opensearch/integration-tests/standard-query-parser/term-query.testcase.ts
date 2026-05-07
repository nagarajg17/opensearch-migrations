/**
 * Test cases for Solr Standard Query Parser field queries → OpenSearch transformation.
 *
 * These tests validate the query-engine's ability to parse and transform
 * Solr's field:value syntax into OpenSearch match and exists queries.
 *
 * The second section tests field type-aware query selection (term vs match)
 * using `transformBindings.fieldTypes` — the same mechanism as solrconfig
 * defaults. When fieldTypes is provided, exact fields (string, pint, etc.)
 * use `term` queries and analyzed fields (text_general, etc.) use `match`.
 *
 * Adding a new test: just add a solrTest() entry below.
 * It automatically runs against every Solr version in matrix.config.ts.
 */
import { solrTest, SOLR_INTERNAL_RULES } from '../../../test-types';
import type { TestCase } from '../../../test-types';

// ─── Shared field type bindings ───────────────────────────────────────────────
// Mirrors what SolrSchemaProvider would produce from a managed-schema.xml.
// Uses the nested { class, multiValued } format.
const FIELD_TYPES_BINDINGS = {
  fieldTypes: {
    id:       { class: 'solr.StrField',        multiValued: 'false' },
    category: { class: 'solr.StrField',        multiValued: 'false' },
    status:   { class: 'solr.StrField',        multiValued: 'false' },
    title:    { class: 'solr.TextField',       multiValued: 'false' },
    body:     { class: 'solr.TextField',       multiValued: 'false' },
    tags:     { class: 'solr.StrField',        multiValued: 'true'  },
    rating:   { class: 'solr.IntPointField',   multiValued: 'false' },
  },
};

export const testCases: TestCase[] = [
  // ───────────────────────────────────────────────────────────
  // Field queries without fieldTypes (match query — existing behavior)
  // ───────────────────────────────────────────────────────────
  solrTest('query-term-single-field', {
    description: 'Simple field query on a text field — uses match query (no fieldTypes)',
    documents: [
      { id: '1', title: 'laptop', category: 'electronics' },
      { id: '2', title: 'phone', category: 'electronics' },
      { id: '3', title: 'shirt', category: 'clothing' },
    ],
    requestPath: '/solr/testcollection/select?q=category:electronics&wt=json',
    solrSchema: {
      fields: {
        title:    { type: 'text_general' },
        category: { type: 'text_general' },
      },
    },
    opensearchMapping: {
      properties: {
        title:    { type: 'text' },
        category: { type: 'text' },
      },
    },
  }),

  // ───────────────────────────────────────────────────────────
  // Existence queries (field:*)
  // ───────────────────────────────────────────────────────────
  solrTest('query-existence-field-exists', {
    description: 'Existence query matches documents where field has any value',
    documents: [
      { id: '1', title: 'laptop', category: 'electronics' },
      { id: '2', title: 'phone' },
      { id: '3', title: 'shirt', category: 'clothing' },
    ],
    requestPath: '/solr/testcollection/select?q=category:*&wt=json',
    solrSchema: {
      fields: {
        title:    { type: 'text_general' },
        category: { type: 'text_general' },
      },
    },
    opensearchMapping: {
      properties: {
        title:    { type: 'text' },
        category: { type: 'text' },
      },
    },
  }),

  // ───────────────────────────────────────────────────────────
  // Field type-aware queries: exact fields → term query
  // ───────────────────────────────────────────────────────────

  solrTest('query-term-exact-field-string-type', {
    description: 'Exact string field uses term query — case-sensitive exact match',
    documents: [
      { id: '1', title: 'Laptop Pro', category: 'electronics' },
      { id: '2', title: 'Phone X',    category: 'Electronics' }, // capital E — should NOT match
      { id: '3', title: 'T-Shirt',    category: 'clothing' },
    ],
    requestPath: '/solr/testcollection/select?q=category:electronics&wt=json',
    solrSchema: {
      fields: {
        title:    { type: 'text_general', multiValued: false },
        category: { type: 'string', multiValued: false },
      },
    },
    opensearchMapping: {
      properties: {
        title:    { type: 'text' },
        category: { type: 'keyword' },
      },
    },
    assertionRules: SOLR_INTERNAL_RULES,
    transformBindings: FIELD_TYPES_BINDINGS,
  }),

  solrTest('query-term-exact-field-no-partial-match', {
    description: 'Exact string field does not match partial values — term query is exact',
    documents: [
      { id: '1', title: 'Laptop', status: 'in_stock' },
      { id: '2', title: 'Phone',  status: 'out_of_stock' },
      { id: '3', title: 'Tablet', status: 'in_stock' },
    ],
    requestPath: '/solr/testcollection/select?q=status:in_stock&wt=json',
    solrSchema: {
      fields: {
        title:  { type: 'text_general', multiValued: false },
        status: { type: 'string', multiValued: false },
      },
    },
    opensearchMapping: {
      properties: {
        title:  { type: 'text' },
        status: { type: 'keyword' },
      },
    },
    assertionRules: SOLR_INTERNAL_RULES,
    transformBindings: FIELD_TYPES_BINDINGS,
  }),

  solrTest('query-term-exact-field-and-text-field-combined', {
    description: 'AND query combining exact field (term) and text field (match)',
    documents: [
      { id: '1', title: 'Java Programming', category: 'books' },
      { id: '2', title: 'Java Cookbook',    category: 'books' },
      { id: '3', title: 'Python Guide',     category: 'books' },
      { id: '4', title: 'Java Programming', category: 'ebooks' },
    ],
    requestPath: '/solr/testcollection/select?q=' + encodeURIComponent('category:books AND title:Java') + '&wt=json',
    solrSchema: {
      fields: {
        title:    { type: 'text_general', multiValued: false },
        category: { type: 'string', multiValued: false },
      },
    },
    opensearchMapping: {
      properties: {
        title:    { type: 'text' },
        category: { type: 'keyword' },
      },
    },
    assertionRules: SOLR_INTERNAL_RULES,
    transformBindings: FIELD_TYPES_BINDINGS,
  }),

  solrTest('query-term-text-field-still-uses-match-with-fieldtypes', {
    description: 'Text field (solr.TextField) still uses match query even when fieldTypes is provided',
    documents: [
      { id: '1', title: 'Java Programming Guide' },
      { id: '2', title: 'Python Cookbook' },
      { id: '3', title: 'Advanced Java Techniques' },
    ],
    requestPath: '/solr/testcollection/select?q=title:Java&wt=json',
    solrSchema: {
      fields: {
        title: { type: 'text_general', multiValued: false },
      },
    },
    opensearchMapping: {
      properties: {
        title: { type: 'text' },
      },
    },
    assertionRules: SOLR_INTERNAL_RULES,
    transformBindings: FIELD_TYPES_BINDINGS,
  }),

  solrTest('query-term-existence-unaffected-by-fieldtypes', {
    description: 'Existence query (field:*) is unaffected by fieldTypes — always uses exists',
    documents: [
      { id: '1', title: 'Laptop', category: 'electronics' },
      { id: '2', title: 'Phone' },
      { id: '3', title: 'Shirt', category: 'clothing' },
    ],
    requestPath: '/solr/testcollection/select?q=category:*&wt=json',
    solrSchema: {
      fields: {
        title:    { type: 'text_general', multiValued: false },
        category: { type: 'string', multiValued: false },
      },
    },
    opensearchMapping: {
      properties: {
        title:    { type: 'text' },
        category: { type: 'keyword' },
      },
    },
    assertionRules: SOLR_INTERNAL_RULES,
    transformBindings: FIELD_TYPES_BINDINGS,
  }),
];
