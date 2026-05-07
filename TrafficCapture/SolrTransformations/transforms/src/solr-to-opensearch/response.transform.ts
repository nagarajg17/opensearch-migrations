/**
 * OpenSearch → Solr response transform.
 *
 * Thin entry point — parses context once, runs the pipeline, writes the body
 * Map back as inlinedJsonBody. Zero serialization in JavaScript — Jackson
 * handles JSON on the Java side.
 *
 * The Java shim bundles {request, response} into a single LinkedHashMap before
 * calling transformJson(), following the same pattern as the replayer's tuple
 * transforms.
 */
import { buildResponseContext } from './context';
import type { JavaMap } from './context';
import { runPipeline } from './pipeline';
import { responseRegistry } from './registry';
import { resolveFieldTypes } from './request.transform';

// Read fieldTypes from bindings once at init — same pattern as request.transform.ts.
// The response transformer is configured with the same solrSchemaXmlFile as the
// request transformer so both have access to field type metadata.
declare const bindings: any;
const fieldTypes = resolveFieldTypes(
  typeof bindings !== 'undefined' ? bindings : undefined, //NOSONAR — typeof required for undeclared closure var
);

export function transform(msg: JavaMap): JavaMap {
  const request = msg.get('request');
  const response = msg.get('response');
  if (!request || !response) return msg;

  const ctx = buildResponseContext(request, response);
  if (ctx.endpoint === 'unknown') return msg;
  ctx.fieldTypes = fieldTypes;
  runPipeline(responseRegistry, ctx);

  let payload = response.get('payload');
  if (!payload) {
    payload = new Map();
    response.set('payload', payload);
  }
  payload.set('inlinedJsonBody', ctx.responseBody);
  return response;
}
