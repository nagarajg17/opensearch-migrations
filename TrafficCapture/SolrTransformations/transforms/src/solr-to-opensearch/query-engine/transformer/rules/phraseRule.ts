/**
 * Transformation rule for PhraseNode → OpenSearch `match_phrase` query.
 *
 * Maps Solr's explicit field:"phrase" syntax to OpenSearch's match_phrase query.
 * Bare phrases (without field prefix) are handled by bareQueryRule instead.
 *
 * Examples:
 *   `title:"hello world"` → Map{"match_phrase" → Map{"title" → Map{"query" → "hello world"}}}
 *   `description:"search engine"` → Map{"match_phrase" → Map{"description" → Map{"query" → "search engine"}}}
 *
 * Unsupported:
 *   - Proximity/slop searches ("jakarta apache"~10) - throws error
 *
 * Note: Boosts are handled separately by BoostNode.
 */

import type { ASTNode } from '../../ast/nodes';
import type { TransformRuleFn } from '../types';

/** Regex to detect proximity/slop patterns (phrase followed by ~N) */
const PROXIMITY_PATTERN = /~\d*$/;

export const phraseRule: TransformRuleFn = (
  node: ASTNode,
  // Phrase is a leaf node — transformChild not used
  _transformChild,
): Map<string, any> => {
  if (node.type !== 'phrase') {
    const msg = `[phraseRule] Called with wrong node type: ${node.type}`;
    console.error(msg);
    throw new Error(msg);
  }

  const { field, text } = node;

  // Detect unsupported proximity/slop patterns
  if (PROXIMITY_PATTERN.test(text)) {
    const msg = `[phraseRule] Proximity/slop queries aren't supported yet. Query: ${field}:"${text}"`;
    console.error(msg);
    throw new Error(msg);
  }

  // Explicit field → use match_phrase query
  return new Map([['match_phrase', new Map([[field, new Map([['query', text]])]])]]);
};
