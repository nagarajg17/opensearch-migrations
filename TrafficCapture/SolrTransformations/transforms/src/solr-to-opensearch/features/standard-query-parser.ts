/**
 * Query q parameter — convert Solr q param to OpenSearch query DSL using lucene parser.
 *
 * Uses AST-based parsing for proper handling of:
 *   - Boolean operators (AND, OR, NOT)
 *   - Nested parentheses
 *   - Range queries
 *   - Phrase queries
 *   - Boosting
 */
import * as lucene from 'lucene';
import type { MicroTransform } from '../pipeline';
import type { RequestContext, JavaMap } from '../context';

type LuceneNode = {
  field?: string;
  term?: string;
  term_min?: string;
  term_max?: string;
  inclusive_min?: boolean;
  inclusive_max?: boolean;
  quoted?: boolean;
  boost?: number;
  prefix?: string;
  operator?: string;
  left?: LuceneNode;
  right?: LuceneNode;
};

function toMap(obj: object): JavaMap {
  const map = new Map();
  for (const [k, v] of Object.entries(obj)) {
    map.set(k, v && typeof v === 'object' && !Array.isArray(v) ? toMap(v) : v);
  }
  return map;
}

function astToOpenSearch(node: LuceneNode): JavaMap {
  // Match all
  if (node.field === '*' && node.term === '*') {
    return toMap({ match_all: {} });
  }

  // Range query: field:[a TO b] or field:{a TO b}
  if (node.term_min !== undefined || node.term_max !== undefined) {
    const range: Record<string, string | number> = {};
    if (node.term_min !== undefined) {
      range[node.inclusive_min ? 'gte' : 'gt'] = node.term_min;
    }
    if (node.term_max !== undefined) {
      range[node.inclusive_max ? 'lte' : 'lt'] = node.term_max;
    }
    return toMap({ range: { [node.field || '_all']: range } });
  }

  // Phrase query: field:"hello world"
  if (node.quoted && node.field && node.term) {
    const q: Record<string, unknown> = { [node.field]: node.term };
    if (node.boost) q.boost = node.boost;
    return toMap({ match_phrase: q });
  }

  // Term query: field:value
  if (node.field && node.term) {
    const q: Record<string, unknown> = node.boost 
      ? { value: node.term, boost: node.boost }
      : node.term;
    return toMap({ term: { [node.field]: q } });
  }

  // Boolean operators
  if (node.operator) {
    const left = node.left ? astToOpenSearch(node.left) : null;
    const right = node.right ? astToOpenSearch(node.right) : null;

    // Handle prefix operators (+, -)
    const leftPrefix = node.left?.prefix;
    const rightPrefix = node.right?.prefix;

    if (node.operator === 'AND') {
      const must: JavaMap[] = [];
      if (left) must.push(left);
      if (right) must.push(right);
      return toMap({ bool: { must } });
    }

    if (node.operator === 'OR') {
      const should: JavaMap[] = [];
      if (left) should.push(left);
      if (right) should.push(right);
      return toMap({ bool: { should } });
    }

    if (node.operator === 'NOT') {
      return toMap({
        bool: {
          must: left ? [left] : [],
          must_not: right ? [right] : [],
        },
      });
    }

    // Implicit OR (default)
    if (node.operator === '<implicit>') {
      // Check for prefix operators
      if (leftPrefix === '+' || rightPrefix === '+') {
        const must: JavaMap[] = [];
        const should: JavaMap[] = [];
        if (left) (leftPrefix === '+' ? must : should).push(left);
        if (right) (rightPrefix === '+' ? must : should).push(right);
        return toMap({ bool: { must, should } });
      }
      if (leftPrefix === '-' || rightPrefix === '-') {
        const must: JavaMap[] = [];
        const must_not: JavaMap[] = [];
        if (left) (leftPrefix === '-' ? must_not : must).push(left);
        if (right) (rightPrefix === '-' ? must_not : must).push(right);
        return toMap({ bool: { must, must_not } });
      }
      // Default: OR
      const should: JavaMap[] = [];
      if (left) should.push(left);
      if (right) should.push(right);
      return toMap({ bool: { should } });
    }
  }

  // Fallback: pass through to query_string
  return toMap({ query_string: { query: node.term || '*:*' } });
}

function parseSolrQueryWithLucene(q: string): JavaMap {
  if (!q || q === '*:*') {
    return toMap({ match_all: {} });
  }

  try {
    const ast = lucene.parse(q);
    return astToOpenSearch(ast as LuceneNode);
  } catch {
    // Fallback to query_string if parsing fails
    return toMap({ query_string: { query: q } });
  }
}

export const request: MicroTransform<RequestContext> = {
  name: 'standard-query-parser',
  apply: (ctx) => {
    const q = ctx.params.get('q') || '*:*';
    ctx.body.set('query', parseSolrQueryWithLucene(q));
  },
};
