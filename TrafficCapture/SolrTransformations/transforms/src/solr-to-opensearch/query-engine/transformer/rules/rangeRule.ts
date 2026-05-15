/**
 * Transformation rule for RangeNode → OpenSearch `range` query.
 *
 * Maps Solr's range syntax to OpenSearch's range query:
 *   RangeNode.lowerInclusive=true  → gte (greater than or equal)
 *   RangeNode.lowerInclusive=false → gt  (greater than)
 *   RangeNode.upperInclusive=true  → lte (less than or equal)
 *   RangeNode.upperInclusive=false → lt  (less than)
 *
 * Unbounded ranges use `*` which is omitted from the output.
 *
 * Date and date-math bounds are translated from Solr format to OpenSearch
 * format via convertSolrDateMathBound():
 *   - Plain ISO strings (e.g. "2024-01-15T00:00:00Z") are passed through unchanged
 *   - NOW-based expressions are lowercased and operators are unit-translated:
 *       NOW-7DAYS/DAY → now-7d/d
 *   - ISO-anchored date math uses the OpenSearch || separator:
 *       2024-01-01T00:00:00Z+1MONTH → 2024-01-01T00:00:00Z||+1M
 *
 * Examples (numeric):
 *   `price:[10 TO 100]` → Map{"range" → Map{"price" → Map{"gte" → "10", "lte" → "100"}}}
 *   `price:{10 TO 100}` → Map{"range" → Map{"price" → Map{"gt" → "10", "lt" → "100"}}}
 *   `price:[10 TO 100}` → Map{"range" → Map{"price" → Map{"gte" → "10", "lt" → "100"}}}
 *   `price:[* TO 100]`  → Map{"range" → Map{"price" → Map{"lte" → "100"}}}
 *   `price:[10 TO *]`   → Map{"range" → Map{"price" → Map{"gte" → "10"}}}
 *
 * Examples (date):
 *   `event_date:[2024-01-01T00:00:00Z TO 2024-12-31T23:59:59Z]`
 *     → Map{"range" → Map{"event_date" → Map{"gte" → "2024-01-01T00:00:00Z", "lte" → "2024-12-31T23:59:59Z"}}}
 *
 * Examples (date math):
 *   `event_date:[NOW-7DAYS TO NOW]`
 *     → Map{"range" → Map{"event_date" → Map{"gte" → "now-7d", "lte" → "now"}}}
 *   `event_date:[NOW/DAY TO NOW+1DAY/DAY]`
 *     → Map{"range" → Map{"event_date" → Map{"gte" → "now/d", "lte" → "now+1d/d"}}}
 *   `event_date:[2024-01-01T00:00:00Z+1MONTH TO *]`
 *     → Map{"range" → Map{"event_date" → Map{"gte" → "2024-01-01T00:00:00Z||+1M"}}}
 */

import type { ASTNode } from '../../ast/nodes';
import type { TransformRuleFn } from '../types';
import { isSolrDateMathBound, convertSolrDateMathBound } from '../../../features/utils';

/**
 * Translate a range bound value for OpenSearch.
 *
 * - `*`          → omitted by the caller (unbounded)
 * - Date math    → converted via convertSolrDateMathBound()
 * - Everything else (numeric, plain ISO date, plain string) → returned as-is
 */
function translateBound(bound: string): string {
  if (isSolrDateMathBound(bound)) {
    return convertSolrDateMathBound(bound);
  }
  return bound;
}

export const rangeRule: TransformRuleFn = (
  node: ASTNode,
  // Range is a leaf node — transformChild not used
  _transformChild,
): Map<string, any> => {
  const { field, lower, upper, lowerInclusive, upperInclusive } = node;

  // [* TO *] means "field exists" in Solr — convert to exists query
  if (lower === '*' && upper === '*') {
    return new Map([['exists', new Map([['field', field]])]]);
  }

  const bounds = new Map<string, string>();

  // Only include bounds that are not unbounded (*)
  if (lower !== '*') {
    bounds.set(lowerInclusive ? 'gte' : 'gt', translateBound(lower));
  }
  if (upper !== '*') {
    bounds.set(upperInclusive ? 'lte' : 'lt', translateBound(upper));
  }

  return new Map([['range', new Map([[field, bounds]])]]);
};
