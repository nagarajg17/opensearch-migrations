/**
 * Solr → OpenSearch request transform.
 *
 * Thin entry point — parses context once, runs the pipeline, writes the body
 * Map back as inlinedJsonBody. Zero serialization in JavaScript — Jackson
 * handles JSON on the Java side.
 */
import { buildRequestContext } from './context';
import type { JavaMap } from './context';
import { runPipeline } from './pipeline';
import { requestRegistry } from './registry';
import { flushMetrics } from './metrics';

// Read solrConfig from bindings once at init (closure, not global mutable state).
// bindings is injected by Java via JavascriptTransformer's bindingsObject.
declare const bindings: any;
const solrConfig = (typeof bindings !== 'undefined' && bindings?.solrConfig) //NOSONAR — typeof required for undeclared closure var
  ? bindings.solrConfig
  : undefined;

// Read fieldTypes from bindings once at init. Java provides a flat map of
// fieldName → solrTypeClass (e.g. {"title":"solr.TextField","id":"solr.StrField"})
// resolved from managed-schema.xml via solrSchemaXmlFile config.
// Empty map when solrSchemaXmlFile is not configured — fieldRule falls back to match.
const fieldTypes: ReadonlyMap<string, string> =
  (typeof bindings !== 'undefined' && bindings?.fieldTypes) //NOSONAR — typeof required for undeclared closure var
    ? new Map(Object.entries(bindings.fieldTypes as Record<string, string>))
    : new Map();

export function transform(msg: JavaMap): JavaMap {
  const ctx = buildRequestContext(msg);
  if (ctx.endpoint === 'unknown') return msg;
  ctx.solrConfig = solrConfig;
  ctx.fieldTypes = fieldTypes;
  runPipeline(requestRegistry, ctx);
  if (ctx.body.size > 0) {
    let payload = msg.get('payload');
    if (!payload) {
      payload = new Map();
      msg.set('payload', payload);
    }
    payload.set('inlinedJsonBody', ctx.body);
  }
  flushMetrics(ctx._metrics, msg);
  return msg;
}
