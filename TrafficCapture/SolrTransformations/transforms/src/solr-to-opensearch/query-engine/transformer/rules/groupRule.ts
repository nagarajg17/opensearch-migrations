/**
 * Transformation rule for GroupNode → OpenSearch query.
 *
 * GroupNode represents parentheses in Solr syntax, used to override operator
 * precedence. OpenSearch doesn't have an equivalent concept — precedence is
 * handled by nesting bool queries. This rule simply unwraps the group and
 * transforms its child.
 *
 * Example:
 *   Input: GroupNode { child: BoolNode { or: [FieldNode, FieldNode] } }
 *   Output: Map{"bool" → Map{"should" → [...]}}
 *
 * The GroupNode is transparent in the output — it doesn't produce any
 * OpenSearch DSL structure of its own.
 */

import type { ASTNode } from '../../ast/nodes';
import type { TransformRuleFn, TransformChild } from '../types';

export const groupRule: TransformRuleFn = (
  node: ASTNode,
  transformChild: TransformChild,
): Map<string, any> => {
  if (node.type !== 'group') {
    throw new Error(`groupRule called with wrong node type: ${node.type}`);
  }
  return transformChild(node.child);
};
