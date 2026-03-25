/**
 * Transformation rule for PhraseNode → OpenSearch `match_phrase` or `query_string` query.
 *
 * Maps Solr's quoted phrase syntax to OpenSearch's match_phrase query.
 * For default fields (bare phrases like `"hello world"`), uses query_string instead.
 *
 * Examples:
 *   `title:"hello world"` → Map{"match_phrase" → Map{"title" → Map{"query" → "hello world"}}}
 *   `"hello world"` (defaultField, df not set) → Map{"query_string" → Map{"query" → "hello world", "default_field" → "*"}}
 *   `"hello world"` (defaultField, df="content") → Map{"query_string" → Map{"query" → "hello world", "default_field" → "content"}}
 *
 * Note: Boosts are handled separately by BoostNode.
 */

import type { ASTNode } from '../../ast/nodes';
import type { TransformRuleFn } from '../types';

export const phraseRule: TransformRuleFn = (
  node: ASTNode,
  // Phrase is a leaf node — transformChild not used
  _transformChild,
): Map<string, any> => {
  if (node.type !== 'phrase') {
    console.error(`phraseRule called with wrong node type: ${node.type}`);
    throw new Error(`phraseRule called with wrong node type: ${node.type}`);
  }

  const { field, text, defaultField } = node;

  // Default field (bare phrase like `"hello world"`) → use query_string
  if (defaultField) {
    // When field is _text_ (Solr's default catch-all), omit default_field to let OpenSearch use its default
    // Default_field is * when not specified
    if (field === '_text_') {
      return new Map([['query_string', new Map([['query', text]])]]);
    }
    return new Map([['query_string', new Map([['query', text], ['default_field', field]])]]);
  }

  // Explicit field → use match_phrase query
  return new Map([['match_phrase', new Map([[field, new Map([['query', text]])]])]]);
};
