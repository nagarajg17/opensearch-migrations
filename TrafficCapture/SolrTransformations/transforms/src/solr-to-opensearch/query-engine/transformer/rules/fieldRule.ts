/**
 * Transformation rule for FieldNode → OpenSearch `term` or `exists` query.
 *
 * Maps Solr's field:value syntax to OpenSearch's term query.
 * Special case: field:* (existence search) maps to exists query.
 *
 * Examples:
 *   `title:java` → Map{"term" → Map{"title" → Map{"value" → "java"}}}
 *   `title:*` → Map{"exists" → Map{"field" → "title"}}
 *
 * Unsupported:
 *   - Wildcards (te?t, tes*) - throws error
 *   - Fuzzy searches (roam~, roam~1) - throws error
 *
 * Note: Boosts are handled separately by BoostNode.
 */

import type { ASTNode } from '../../ast/nodes';
import type { TransformRuleFn } from '../types';

/** Regex to detect wildcard patterns (contains * or ? but is not just *) */
const WILDCARD_PATTERN = /^(?!^\*$).*[*?].*$/;

/** Regex to detect fuzzy search patterns (contains ~) */
const FUZZY_PATTERN = /~/;

export const fieldRule: TransformRuleFn = (
  node: ASTNode,
  // Field is a leaf node — transformChild not used
  _transformChild,
): Map<string, any> => {
  if (node.type !== 'field') {
    const msg = `[fieldRule] Called with wrong node type: ${node.type}`;
    console.error(msg);
    throw new Error(msg);
  }

  const { field, value } = node;

  // Existence search (field:*) → exists query
  if (value === '*') {
    return new Map([['exists', new Map([['field', field]])]]);
  }

  // Detect unsupported fuzzy patterns (check before wildcard since ~ is more specific)
  if (FUZZY_PATTERN.test(value)) {
    const msg = `[fieldRule] Fuzzy queries aren't supported yet. Query: ${field}:${value}`;
    console.error(msg);
    throw new Error(msg);
  }

  // Detect unsupported wildcard patterns
  if (WILDCARD_PATTERN.test(value)) {
    const msg = `[fieldRule] Wildcard queries aren't supported yet. Query: ${field}:${value}`;
    console.error(msg);
    throw new Error(msg);
  }

  return new Map([['term', new Map([[field, new Map([['value', value]])]])]]);
};
