/**
 * Unit tests for standard-query-parser.ts
 * Tests the Solr → OpenSearch query transformation using AST-based lucene parsing.
 *
 * Run: npx ts-node src/solr-to-opensearch/features/standard-query-parser.test.ts
 */
import { request } from './standard-query-parser';
import type { RequestContext, JavaMap } from '../context';

/** Helper to create a mock RequestContext */
function createMockContext(q: string): RequestContext {
  const params = new URLSearchParams();
  params.set('q', q);

  const body = new Map() as unknown as JavaMap;
  const msg = new Map() as unknown as JavaMap;

  return {
    endpoint: 'select',
    collection: 'test',
    params,
    body,
    msg,
  };
}

/** Helper to convert JavaMap to plain object for easier assertion */
function mapToObject(map: JavaMap): unknown {
  if (!(map instanceof Map)) return map;
  const obj: Record<string, unknown> = {};
  for (const [k, v] of map.entries()) {
    obj[k] = v instanceof Map ? mapToObject(v) : v;
  }
  return obj;
}

interface TestCase {
  name: string;
  query: string;
  expected: unknown;
}

const testCases: TestCase[] = [
  {
    name: 'match_all for *:*',
    query: '*:*',
    expected: { match_all: {} },
  },
  {
    name: 'match_all for empty query',
    query: '',
    expected: { match_all: {} },
  },
  {
    name: 'simple term query',
    query: 'title:search',
    expected: { term: { title: 'search' } },
  },
  {
    name: 'AND boolean query',
    query: 'title:search AND author:john',
    expected: {
      bool: {
        must: [
          { term: { title: 'search' } },
          { term: { author: 'john' } },
        ],
      },
    },
  },
  {
    name: 'OR boolean query',
    query: 'title:test OR content:example',
    expected: {
      bool: {
        should: [
          { term: { title: 'test' } },
          { term: { content: 'example' } },
        ],
      },
    },
  },
  {
    name: 'NOT boolean query',
    query: 'title:search NOT status:draft',
    expected: {
      bool: {
        must: [{ term: { title: 'search' } }],
        must_not: [{ term: { status: 'draft' } }],
      },
    },
  },
  {
    name: 'inclusive range query',
    query: 'price:[10 TO 100]',
    expected: {
      range: { price: { gte: '10', lte: '100' } },
    },
  },
  {
    name: 'exclusive range query',
    query: 'price:{10 TO 100}',
    expected: {
      range: { price: { gt: '10', lt: '100' } },
    },
  },
  {
    name: 'phrase query',
    query: 'title:"hello world"',
    expected: {
      match_phrase: { title: 'hello world' },
    },
  },
  {
    name: 'boosted term query',
    query: 'title:search^2',
    expected: {
      term: { title: { value: 'search', boost: 2 } },
    },
  },
  {
    name: 'required prefix (+)',
    query: '+title:required -status:excluded',
    expected: {
      bool: {
        must: [{ term: { title: 'required' } }],
        must_not: [{ term: { status: 'excluded' } }],
      },
    },
  },
];

console.log('=== Standard Query Parser Unit Tests ===\n');

let passed = 0;
let failed = 0;

for (const tc of testCases) {
  const ctx = createMockContext(tc.query);
  
  try {
    request.apply(ctx);
    const result = mapToObject(ctx.body.get('query') as JavaMap);
    const resultStr = JSON.stringify(result, null, 2);
    const expectedStr = JSON.stringify(tc.expected, null, 2);

    if (resultStr === expectedStr) {
      console.log(`✓ ${tc.name}`);
      passed++;
    } else {
      console.log(`✗ ${tc.name}`);
      console.log(`  Query: ${tc.query}`);
      console.log(`  Expected: ${expectedStr}`);
      console.log(`  Got: ${resultStr}`);
      failed++;
    }
  } catch (e) {
    console.log(`✗ ${tc.name} (threw error)`);
    console.log(`  Query: ${tc.query}`);
    console.log(`  Error: ${e}`);
    failed++;
  }
}

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
