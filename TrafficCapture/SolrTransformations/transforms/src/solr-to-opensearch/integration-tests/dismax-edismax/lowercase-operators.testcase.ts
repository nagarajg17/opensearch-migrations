/**
 * Integration test cases for eDisMax lowercaseOperators parameter.
 *
 * lowercaseOperators=true: treats lowercase "and", "or", "not" as boolean
 * operators, equivalent to uppercase AND, OR, NOT. Defaults to false.
 *
 * edismax-only — dismax does not support lowercaseOperators.
 */
import { solrTest } from '../../../test-types';
import type { TestCase } from '../../../test-types';

const twoFieldSchema = {
  fields: {
    title: { type: 'text_general' as const },
    category: { type: 'text_general' as const },
  },
};

const twoFieldMapping = {
  properties: {
    title: { type: 'text' as const },
    category: { type: 'text' as const },
  },
};

function p(q: string, extra: Record<string, string> = {}): string {
  const base = '/solr/testcollection/select?q=' + encodeURIComponent(q) + '&defType=edismax';
  const rest = Object.entries(extra)
    .map(([k, v]) => `&${k}=${encodeURIComponent(v)}`)
    .join('');
  return base + rest + '&wt=json';
}

export const testCases: TestCase[] = [
  // ─── lowercase "and" ────────────────────────────────────────────────────

  solrTest('edismax-lowercase-and-matches-both-terms', {
    description: 'lowercase "and" treated as AND operator — both terms must match',
    documents: [
      { id: '1', title: 'java programming', category: 'software' },
      { id: '2', title: 'java tutorial', category: 'education' },
      { id: '3', title: 'python programming', category: 'software' },
    ],
    requestPath: p('java and programming', { qf: 'title', lowercaseOperators: 'true' }),
    solrSchema: twoFieldSchema,
    opensearchMapping: twoFieldMapping,
  }),

  solrTest('edismax-lowercase-and-off-by-default', {
    description: 'lowercase "and" treated as bare term when lowercaseOperators=false (default)',
    documents: [
      { id: '1', title: 'java programming', category: 'software' },
      { id: '2', title: 'java tutorial', category: 'education' },
      { id: '3', title: 'python programming', category: 'software' },
    ],
    requestPath: p('java and programming', { qf: 'title' }),
    solrSchema: twoFieldSchema,
    opensearchMapping: twoFieldMapping,
  }),

  // ─── lowercase "or" ─────────────────────────────────────────────────────

  solrTest('edismax-lowercase-or-matches-either-term', {
    description: 'lowercase "or" treated as OR operator — either term matches',
    documents: [
      { id: '1', title: 'java programming', category: 'software' },
      { id: '2', title: 'python tutorial', category: 'education' },
      { id: '3', title: 'unrelated content', category: 'other' },
    ],
    requestPath: p('java or python', { qf: 'title', lowercaseOperators: 'true' }),
    solrSchema: twoFieldSchema,
    opensearchMapping: twoFieldMapping,
  }),

  // ─── mixed uppercase and lowercase operators ─────────────────────────────

  solrTest('edismax-mixed-AND-and-operators', {
    description: 'uppercase AND and lowercase and in same query both work as AND',
    documents: [
      { id: '1', title: 'java programming', category: 'software' },
      { id: '2', title: 'java tutorial', category: 'education' },
      { id: '3', title: 'python programming', category: 'software' },
    ],
    requestPath: p('java AND programming and software', { qf: 'title category', lowercaseOperators: 'true' }),
    solrSchema: twoFieldSchema,
    opensearchMapping: twoFieldMapping,
  }),

  solrTest('edismax-mixed-OR-or-operators', {
    description: 'uppercase OR and lowercase or in same query both work as OR',
    documents: [
      { id: '1', title: 'java programming', category: 'software' },
      { id: '2', title: 'python tutorial', category: 'education' },
      { id: '3', title: 'ruby scripting', category: 'software' },
      { id: '4', title: 'unrelated', category: 'other' },
    ],
    requestPath: p('java OR python or ruby', { qf: 'title', lowercaseOperators: 'true' }),
    solrSchema: twoFieldSchema,
    opensearchMapping: twoFieldMapping,
  }),

  // ─── word boundary — "and" as substring should not be treated as operator ─

  solrTest('edismax-android-not-treated-as-and', {
    description: '"android" contains "and" but must not be split into AND operator',
    documents: [
      { id: '1', title: 'android development', category: 'mobile' },
      { id: '2', title: 'java programming', category: 'software' },
      { id: '3', title: 'unrelated', category: 'other' },
    ],
    requestPath: p('android', { qf: 'title', lowercaseOperators: 'true' }),
    solrSchema: twoFieldSchema,
    opensearchMapping: twoFieldMapping,
  }),
];
