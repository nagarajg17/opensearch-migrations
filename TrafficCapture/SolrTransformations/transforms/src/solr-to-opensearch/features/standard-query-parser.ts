/**
 * Convert Solr q param to OpenSearch query DSL using lucene parser.
 */
import * as lucene from 'lucene';
import type { MicroTransform } from '../pipeline';
import type { RequestContext } from '../context';

type QueryMap = Map<string, unknown>;

/** Term node: field:value or field:"phrase" */
interface TermNode {
  field: string;
  term: string;
  quoted: boolean;
  boost: number | null;
  prefix: '+' | '-' | null;
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

function isBool(node: LuceneNode): node is BinaryNode {
  return 'operator' in node;
}

function isWrapper(node: LuceneNode): node is WrapperNode {
  return 'left' in node && !('operator' in node);
}

function convertRange(node: RangeNode): QueryMap {
  const range = new Map<string, string>();
  const gteOp = node.inclusive === 'both' || node.inclusive === 'left';
  const lteOp = node.inclusive === 'both' || node.inclusive === 'right';
  if (node.term_min !== '*') range.set(gteOp ? 'gte' : 'gt', node.term_min);
  if (node.term_max !== '*') range.set(lteOp ? 'lte' : 'lt', node.term_max);
  return new Map([['range', new Map([[node.field, range]])]]);
}

function convertTerm(node: TermNode): { clause: QueryMap; prefix: string } {
  let field = node.field;
  let prefix = '';

  // Check prefix property first (used when field is implicit)
  if (node.prefix) {
    prefix = node.prefix;
  }
  // Lucene parser puts +/- prefix in field name when field is explicit
  else if (field.startsWith('+') || field.startsWith('-')) {
    prefix = field[0];
    field = field.slice(1);
  }

  // Match all
  if (field === '*' && node.term === '*') {
    return { clause: new Map([['match_all', new Map()]]), prefix };
  }

  // Implicit field - use query_string to let OpenSearch handle default field
  if (field === '<implicit>') {
    const clause = node.boost
      ? new Map([['query_string', new Map<string, unknown>([['query', node.term], ['boost', node.boost]])]])
      : new Map([['query_string', new Map([['query', node.term]])]]);
    return { clause, prefix };
  }

  // Phrase query
  if (node.quoted) {
    const clause = node.boost
      ? new Map([['match_phrase', new Map([[field, new Map<string, unknown>([['query', node.term], ['boost', node.boost]])]])]])
      : new Map([['match_phrase', new Map([[field, node.term]])]]);
    return { clause, prefix };
  }

  // Term query
  const clause = node.boost
    ? new Map([['term', new Map([[field, new Map<string, unknown>([['value', node.term], ['boost', node.boost]])]])]])
    : new Map([['term', new Map([[field, node.term]])]]);
  return { clause, prefix };
}

function convertBool(node: BinaryNode, convert: (n: LuceneNode) => QueryMap): QueryMap {
  const left = convert(node.left);
  const right = convert(node.right);

  switch (node.operator) {
    case 'AND':
      return new Map([['bool', new Map([['must', [left, right]]])]]);
    case 'OR':
      return new Map([['bool', new Map([['should', [left, right]]])]]);
    case 'NOT':
    case 'AND NOT':
      return new Map([['bool', new Map([['must', [left]], ['must_not', [right]]])]]);
    case '<implicit>': {
      // Merge bool clauses from prefix operators (+/-)
      const lBool = left.get('bool') as Map<string, QueryMap[]> | undefined;
      const rBool = right.get('bool') as Map<string, QueryMap[]> | undefined;
      if (lBool || rBool) {
        return new Map([['bool', new Map([
          ['must', [...(lBool?.get('must') || []), ...(rBool?.get('must') || [])]],
          ['must_not', [...(lBool?.get('must_not') || []), ...(rBool?.get('must_not') || [])]],
        ])]]);
      }
      return new Map([['bool', new Map([['should', [left, right]]])]]);
    }
  }
}

function convertTermWithPrefix(node: TermNode): QueryMap {
  const { clause, prefix } = convertTerm(node);
  if (prefix === '+') return new Map([['bool', new Map([['must', [clause]]])]]);
  if (prefix === '-') return new Map([['bool', new Map([['must_not', [clause]]])]]);
  return clause;
}

function convert(node: LuceneNode): QueryMap {
  // Unwrap { left: ... } wrapper
  if (isWrapper(node)) {
    return convert(node.left);
  }

  // Range query
  if (isRange(node)) {
    return convertRange(node);
  }

  // Binary operator
  if (isBool(node)) {
    return convertBool(node, convert);
  }

  // Term node with possible prefix
  return convertTermWithPrefix(node as TermNode);
}

export const request: MicroTransform<RequestContext> = {
  name: 'standard-query-parser',
  apply: (ctx) => {
    const q = ctx.params.get('q') || '*:*';
    if (!q || q === '*:*') {
      ctx.body.set('query', new Map([['match_all', new Map()]]));
      return;
    }
    try {
      ctx.body.set('query', convert(lucene.parse(q) as LuceneNode));
    } catch {
      ctx.body.set('query', new Map([['query_string', new Map([['query', q]])]]));
    }
  },
};
