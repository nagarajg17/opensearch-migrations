/**
 * Test: Solr Query → AST → OpenSearch DSL
 * Run: node test-solr-to-opensearch.cjs
 */
const lucene = require('lucene');

function astToOpenSearch(node) {
  if (!node) return null;
  
  // Handle wrapper with 'left' only (single term)
  if (node.left && !node.operator) {
    return astToOpenSearch(node.left);
  }

  // Match all: *:*
  if (node.field === '*' && node.term === '*') {
    return { match_all: {} };
  }

  // Range query: field:[a TO b] or field:{a TO b}
  if (node.term_min !== undefined || node.term_max !== undefined) {
    const range = {};
    const inclusive = node.inclusive || 'both';
    if (node.term_min !== undefined) {
      range[inclusive === 'both' || inclusive === 'left' ? 'gte' : 'gt'] = node.term_min;
    }
    if (node.term_max !== undefined) {
      range[inclusive === 'both' || inclusive === 'right' ? 'lte' : 'lt'] = node.term_max;
    }
    return { range: { [node.field || '_all']: range } };
  }

  // Phrase query: field:"hello world"
  if (node.quoted && node.field && node.term) {
    const q = { [node.field]: node.term };
    if (node.boost) q[node.field] = { query: node.term, boost: node.boost };
    return { match_phrase: q };
  }

  // Term query: field:value
  if (node.field && node.term) {
    const q = node.boost 
      ? { value: node.term, boost: node.boost }
      : node.term;
    return { term: { [node.field]: q } };
  }

  // Boolean operators
  if (node.operator) {
    const left = node.left ? astToOpenSearch(node.left) : null;
    const right = node.right ? astToOpenSearch(node.right) : null;

    if (node.operator === 'AND') {
      const must = [];
      if (left) must.push(left);
      if (right) must.push(right);
      return { bool: { must } };
    }

    if (node.operator === 'OR') {
      const should = [];
      if (left) should.push(left);
      if (right) should.push(right);
      return { bool: { should } };
    }

    if (node.operator === 'NOT') {
      return {
        bool: {
          must: left ? [left] : [],
          must_not: right ? [right] : [],
        },
      };
    }

    // Implicit OR (default when no explicit operator)
    if (node.operator === '<implicit>') {
      const should = [];
      if (left) should.push(left);
      if (right) should.push(right);
      return { bool: { should } };
    }
  }

  return { query_string: { query: node.term || '*:*' } };
}

function solrToOpenSearch(solrQuery) {
  if (!solrQuery || solrQuery === '*:*') {
    return { query: { match_all: {} } };
  }
  try {
    const ast = lucene.parse(solrQuery);
    return { query: astToOpenSearch(ast) };
  } catch (e) {
    return { query: { query_string: { query: solrQuery } } };
  }
}

// Test cases
const testCases = [
  { solr: '*:*', desc: 'Match all' },
  { solr: 'title:search', desc: 'Simple term' },
  { solr: 'title:search AND author:john', desc: 'AND query' },
  { solr: 'title:search OR author:john', desc: 'OR query' },
  { solr: '(title:search AND author:john) OR category:docs', desc: 'Nested boolean' },
  { solr: 'price:[10 TO 100]', desc: 'Inclusive range' },
  { solr: 'price:{10 TO 100}', desc: 'Exclusive range' },
  { solr: 'title:"hello world"', desc: 'Phrase query' },
  { solr: 'title:search^2', desc: 'Boosted term' },
  { solr: 'title:search NOT status:draft', desc: 'NOT query' },
];

console.log('=== Solr → OpenSearch Query Translation ===\n');
console.log('='.repeat(80));

for (const tc of testCases) {
  console.log(`\n[${tc.desc}]`);
  console.log(`Solr:       ${tc.solr}`);
  const osDsl = solrToOpenSearch(tc.solr);
  console.log(`OpenSearch: ${JSON.stringify(osDsl, null, 2)}`);
  console.log('-'.repeat(80));
}
