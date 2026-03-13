/**
 * Convert Solr q param to OpenSearch query DSL using lucene parser.
 */
import * as lucene from 'lucene';
import type { MicroTransform } from '../pipeline';
import type { RequestContext, JavaMap } from '../context';

/** Term node: field:value or field:"phrase" */
interface TermNode {
  field: string;
  term: string;
  quoted: boolean;
  boost: number | null;
}

/** Range node: field:[min TO max] or field:{min TO max} */
interface RangeNode {
  field: string;
  term_min: string;
  term_max: string;
  inclusive: 'both' | 'none' | 'left' | 'right';
}

/** Binary expression: left OP right */
interface BinaryNode {
  left: LuceneNode;
  operator: 'AND' | 'OR' | 'NOT' | 'AND NOT' | '<implicit>';
  right: LuceneNode;
}

/** Wrapper node: { left: node } with no operator */
interface WrapperNode {
  left: TermNode | RangeNode;
}

type LuceneNode = TermNode | RangeNode | BinaryNode | WrapperNode;

function isRange(node: LuceneNode): node is RangeNode {
  return 'term_min' in node;
}

function isBinary(node: LuceneNode): node is BinaryNode {
  return 'operator' in node;
}

function isWrapper(node: LuceneNode): node is WrapperNode {
  return 'left' in node && !('operator' in node);
}

function toMap(obj: object): JavaMap {
  const map = new Map();
  for (const [k, v] of Object.entries(obj)) {
    map.set(k, Array.isArray(v) ? v : v && typeof v === 'object' ? toMap(v) : v);
  }
  return map as unknown as JavaMap;
}

function convertRange(node: RangeNode): object {
  const range: Record<string, string> = {};
  const gteOp = node.inclusive === 'both' || node.inclusive === 'left';
  const lteOp = node.inclusive === 'both' || node.inclusive === 'right';
  if (node.term_min !== '*') range[gteOp ? 'gte' : 'gt'] = node.term_min;
  if (node.term_max !== '*') range[lteOp ? 'lte' : 'lt'] = node.term_max;
  return { range: { [node.field]: range } };
}

function convertTerm(node: TermNode): { clause: object; prefix: string } {
  let field = node.field;
  let prefix = '';

  // Lucene parser puts +/- prefix in field name
  if (field.startsWith('+') || field.startsWith('-')) {
    prefix = field[0];
    field = field.slice(1);
  }

  // Match all
  if (field === '*' && node.term === '*') {
    return { clause: { match_all: {} }, prefix };
  }

  // Phrase query
  if (node.quoted) {
    const clause = node.boost
      ? { match_phrase: { [field]: { query: node.term, boost: node.boost } } }
      : { match_phrase: { [field]: node.term } };
    return { clause, prefix };
  }

  // Term query
  const clause = node.boost
    ? { term: { [field]: { value: node.term, boost: node.boost } } }
    : { term: { [field]: node.term } };
  return { clause, prefix };
}

function convert(node: LuceneNode): object {
  // Unwrap { left: ... } wrapper
  if (isWrapper(node)) {
    return convert(node.left);
  }

  // Range query
  if (isRange(node)) {
    return convertRange(node);
  }

  // Binary operator
  if (isBinary(node)) {
    const left = convert(node.left);
    const right = convert(node.right);

    switch (node.operator) {
      case 'AND':
        return { bool: { must: [left, right] } };
      case 'OR':
        return { bool: { should: [left, right] } };
      case 'NOT':
      case 'AND NOT':
        return { bool: { must: [left], must_not: [right] } };
      case '<implicit>': {
        // Merge bool clauses from prefix operators (+/-)
        const lBool = 'bool' in left ? (left as { bool: Record<string, object[]> }).bool : null;
        const rBool = 'bool' in right ? (right as { bool: Record<string, object[]> }).bool : null;
        if (lBool || rBool) {
          return {
            bool: {
              must: [...(lBool?.must || []), ...(rBool?.must || [])],
              must_not: [...(lBool?.must_not || []), ...(rBool?.must_not || [])],
            },
          };
        }
        return { bool: { should: [left, right] } };
      }
    }
  }

  // Term node with possible prefix
  const { clause, prefix } = convertTerm(node as TermNode);
  if (prefix === '+') return { bool: { must: [clause] } };
  if (prefix === '-') return { bool: { must_not: [clause] } };
  return clause;
}

export const request: MicroTransform<RequestContext> = {
  name: 'standard-query-parser',
  apply: (ctx) => {
    const q = ctx.params.get('q') || '*:*';
    if (!q || q === '*:*') {
      ctx.body.set('query', toMap({ match_all: {} }));
      return;
    }
    try {
      ctx.body.set('query', toMap(convert(lucene.parse(q) as LuceneNode)));
    } catch {
      ctx.body.set('query', toMap({ query_string: { query: q } }));
    }
  },
};
