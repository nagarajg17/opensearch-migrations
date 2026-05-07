/**
 * Hits to docs — convert OpenSearch hits.hits[]._source to Solr response.docs[].
 *
 * Response-only. Uses .get()/.set() on Java Maps throughout.
 *
 * Schema mode (field present in fieldTypes):
 * Uses .get('multiValued') as the authoritative signal.
 * multiValued="true"  → wrap in array
 * multiValued="false" → scalar
 *
 * Schemaless mode (field NOT in fieldTypes, meta === undefined):
 * Defaults to array (wrap in array). In Solr's schemaless/data-driven mode,
 * fields default to multiValued=true.
 */
import type { MicroTransform } from '../pipeline';
import type { ResponseContext, JavaMap } from '../context';

/**
 * Determine whether a field value should be returned as an array or scalar.
 *
 * Schema mode: uses .get('multiValued') — authoritative when schema is configured.
 * multiValued="true"  → wrap in array
 * multiValued="false" → scalar
 *
 * Schemaless mode (meta undefined): defaults to true — Solr schemaless defaults
 * multiValued to true, assuming fields may contain multiple values later.
 */
function shouldWrapInArray(meta: JavaMap | undefined): boolean {
  if (meta === undefined) {
    // Schemaless mode — default to array (Solr schemaless default: multiValued=true)
    return true;
  }
  return meta.get('multiValued') === 'true';
}

/** Convert a single OpenSearch hit to a Solr doc. */
function hitToDoc(hit: JavaMap, fieldTypes: ReadonlyMap<string, JavaMap>): JavaMap {
  const source: JavaMap = hit.get('_source');
  const doc = new Map();
  doc.set('id', hit.get('_id'));
  for (const key of source.keys()) {
    if (key === 'id') continue;
    const value = source.get(key);
    if (key === 'id' || typeof value === 'number' || typeof value === 'boolean') {
      doc.set(key, value);
    } else if (Array.isArray(value)) {
      doc.set(key, value);
    } else {
      // String/other: use schema (multiValued) or schemaless default (array)
      const meta = fieldTypes.get(key);
      if (shouldWrapInArray(meta)) {
        doc.set(key, [value]);
      } else {
        doc.set(key, value);
      }
    }
  }
  doc.set('_version_', hit.has('_version') ? hit.get('_version') : 0);
  return doc;
}

export const response: MicroTransform<ResponseContext> = {
  name: 'hits-to-docs',
  match: (ctx) => ctx.responseBody.has('hits'),
  apply: (ctx) => {
    const hits: JavaMap = ctx.responseBody.get('hits');
    const hitsArray: JavaMap[] = hits.get('hits');
    const total: JavaMap = hits.get('total');

    const responseMap = new Map();
    responseMap.set('numFound', total.get('value'));
    responseMap.set('start', ctx.requestParams.has('cursorMark')
      ? 0
      : Number.parseInt(ctx.requestParams.get('start') || '0', 10));
    responseMap.set('numFoundExact', true);
    responseMap.set('docs', hitsArray.map((hit) => hitToDoc(hit, ctx.fieldTypes)));
    ctx.responseBody.set('response', responseMap);

    ctx.responseBody.delete('hits');
    ctx.responseBody.delete('took');
    ctx.responseBody.delete('timed_out');
    ctx.responseBody.delete('_shards');
  },
};
