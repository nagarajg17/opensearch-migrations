/**
 * Transformation rule for BareQueryNode → OpenSearch `query_string` query.
 *
 * Maps bare Solr terms/phrases (without field prefix) to OpenSearch's query_string.
 * When defaultField is set, includes it in the output; otherwise omits it to let
 * OpenSearch use its default behavior.
 *
 * For phrases (isPhrase=true), wraps the query in quotes so OpenSearch's
 * query_string treats it as a phrase search matching words in order.
 *
 * Examples:
 *   `java` (no df) → Map{"query_string" → Map{"query" → "java"}}
 *   `java` (df="content") → Map{"query_string" → Map{"query" → "java", "default_field" → "content"}}
 *   `"hello world"` (no df) → Map{"query_string" → Map{"query" → "\"hello world\""}}
 *   `"hello world"` (df="title") → Map{"query_string" → Map{"query" → "\"hello world\"", "default_field" → "title"}}
 *
 * Note: Boosts are handled separately by BoostNode.
 */

import type { ASTNode } from '../../ast/nodes';
import type { TransformRuleFn } from '../types';

export const bareQueryRule: TransformRuleFn = (
  node: ASTNode,
  // BareQuery is a leaf node — transformChild not used
  _transformChild,
): Map<string, any> => {
  if (node.type !== 'bareQuery') {
    const msg = `[bareQueryRule] Called with wrong node type: ${node.type}`;
    console.error(msg);
    throw new Error(msg);
  }

  const { query, isPhrase, defaultField } = node;

  // Wrap phrases in quotes for query_string to treat as phrase search
  const queryText = isPhrase ? `"${query}"` : query;

  // Include default_field only when explicitly set
  if (defaultField) {
    return new Map([['query_string', new Map([['query', queryText], ['default_field', defaultField]])]]);
  }

  return new Map([['query_string', new Map([['query', queryText]])]]);
};
