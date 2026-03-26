/**
 * Transformation rule for MatchAllNode → OpenSearch `match_all` query.
 *
 * Maps Solr's *:* syntax to OpenSearch's match_all query.
 *
 * Examples:
 *   `*:*` → Map{"match_all" → Map{}}
 */

import type { ASTNode } from '../../ast/nodes';
import type { TransformRuleFn } from '../types';

export const matchAllRule: TransformRuleFn = (
  node: ASTNode,
  // MatchAll is a leaf node — transformChild not used
  _transformChild,
): Map<string, any> => {
  if (node.type !== 'matchAll') {
    console.error(`matchAllRule called with wrong node type: ${node.type}`);
    throw new Error(`matchAllRule called with wrong node type: ${node.type}`);
  }

  return new Map([['match_all', new Map()]]);
};
