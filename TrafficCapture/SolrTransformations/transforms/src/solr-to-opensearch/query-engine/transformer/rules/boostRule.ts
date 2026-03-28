/**
 * Transformation rule for BoostNode → OpenSearch query with `boost` parameter.
 *
 * Applies Solr's boost modifier (^N) to any query type by adding the `boost`
 * parameter to the child query's OpenSearch DSL output.
 *
 * OpenSearch queries follow two structural patterns for boost placement:
 *
 *   1. Field-level queries: {"queryType": {"fieldName": {params, "boost": N}}}
 *      Examples: term, match_phrase, range, wildcard, fuzzy, prefix, regexp
 *
 *   2. Query-level queries: {"queryType": {params, "boost": N}}
 *      Examples: query_string, bool, exists, match_all
 *
 * Instead of maintaining hardcoded lists of query types, we detect the structure
 * at runtime by checking if the first value in the query body is a Map (field-level)
 * or a primitive like string/array (query-level).
 *
 * Structural detection example:
 *
 *   Field-level (term query):
 *     Input:  Map{"term" → Map{"title" → Map{"value" → "java"}}}
 *                                  ↑
 *                         first value is a Map → field-level
 *     Output: Map{"term" → Map{"title" → Map{"value" → "java", "boost" → 2}}}
 *
 *   Query-level (query_string):
 *     Input:  Map{"query_string" → Map{"query" → "java"}}
 *                                          ↑
 *                                 first value is a string → query-level
 *     Output: Map{"query_string" → Map{"query" → "java", "boost" → 2}}
 *
 * This approach is future-proof: new query types automatically work without
 * updating any hardcoded lists, as long as they follow OpenSearch's conventions.
 */

import type { ASTNode } from '../../ast/nodes';
import type { TransformRuleFn, TransformChild } from '../types';

export const boostRule: TransformRuleFn = (
  node: ASTNode,
  transformChild: TransformChild,
): Map<string, any> => {
  if (node.type !== 'boost') {
    const msg = `[boostRule] Called with wrong node type: ${node.type}`;
    console.error(msg);
    throw new Error(msg);
  }

  const { child, value: boostValue } = node;

  // Transform the child node first
  const childResult = transformChild(child);

  // Get the query type and body
  // e.g., for {"term": {"title": {"value": "java"}}}
  //       queryType = "term", queryBody = Map{"title" → Map{...}}
  const queryType = childResult.keys().next().value as string;
  const queryBody = childResult.get(queryType) as Map<string, any>;

  // Detect structure by checking if the first value is a Map (field-level)
  // or a primitive like string/array (query-level).
  //
  // Field-level example: {"term": {"title": {"value": "java"}}}
  //   queryBody = Map{"title" → Map{"value" → "java"}}
  //   firstValue = Map{"value" → "java"} → instanceof Map = true
  //   → Add boost to firstValue: Map{"value" → "java", "boost" → 2}
  //
  // Query-level example: {"query_string": {"query": "java"}}
  //   queryBody = Map{"query" → "java"}
  //   firstValue = "java" → instanceof Map = false
  //   → Add boost to queryBody: Map{"query" → "java", "boost" → 2}
  const firstValue = queryBody.values().next().value;

  if (firstValue instanceof Map) {
    // Field-level: boost goes inside the field params Map
    firstValue.set('boost', boostValue);
  } else {
    // Query-level: boost goes at the query body level
    queryBody.set('boost', boostValue);
  }

  return childResult;
};
