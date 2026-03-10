/**
 * Test script for lucene query parser
 * Run: npx ts-node src/solr-to-opensearch/features/test-lucene-parser.ts
 */
import * as lucene from 'lucene';

const testQueries = [
  '*:*',
  'title:search',
  'title:search AND author:john',
  '(title:search AND author:john) OR category:docs',
  'price:[10 TO 100]',
  'price:{10 TO 100}',
  'title:"hello world"',
  'title:search^2',
  'title:search NOT status:draft',
  '+title:required -status:excluded',
  'title:test OR content:example',
];

console.log('=== Lucene Parser AST Output ===\n');

for (const q of testQueries) {
  console.log(`Query: ${q}`);
  console.log('-'.repeat(50));
  try {
    const ast = lucene.parse(q);
    console.log('AST:', JSON.stringify(ast, null, 2));
  } catch (e) {
    console.log('Error:', e);
  }
  console.log('\n');
}
