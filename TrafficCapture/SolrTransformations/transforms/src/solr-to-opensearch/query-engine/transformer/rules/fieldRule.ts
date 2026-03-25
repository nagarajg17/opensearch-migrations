/**
 * Transformation rule for FieldNode → OpenSearch `term` or `query_string` query.
 *
 * Maps Solr's field:value syntax to OpenSearch's term query.
 * For default fields (bare values like `java`), uses query_string instead.
 *
 * Examples:
 *   `title:java` → Map{"term" → Map{"title" → Map{"value" → "java"}}}
 *   `java` (defaultField, df not set) → Map{"query_string" → Map{"query" → "java", "default_field" → "*"}}
 *   `java` (defaultField, df="content") → Map{"query_string" → Map{"query" → "java", "default_field" → "content"}}
 *
 * Note: Boosts are handled separately by BoostNode.
 */

import type { ASTNode } from '../../ast/nodes';
import type { TransformRuleFn } from '../types';

export const fieldRule: TransformRuleFn = (
  node: ASTNode,
  // Field is a leaf node — transformChild not used
  _transformChild,
): Map<string, any> => {
  if (node.type !== 'field') {
    console.error(`fieldRule called with wrong node type: ${node.type}`);
    throw new Error(`fieldRule called with wrong node type: ${node.type}`);
  }

  const { field, value, defaultField } = node;

  // Default field (bare value like `java`) → use query_string
  if (defaultField) {
    // When field is _text_ (Solr's default catch-all), omit default_field to let OpenSearch use its default
    // Default_field is * when not specified
    if (field === '_text_') {
      return new Map([['query_string', new Map([['query', value]])]]);
    }
    return new Map([['query_string', new Map([['query', value], ['default_field', field]])]]);
  }

  // Explicit field → use term query
  return new Map([['term', new Map([[field, new Map([['value', value]])]])]]);
};
