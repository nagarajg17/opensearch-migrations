/**
 * Unit tests for response.transform.ts.
 *
 * transform() is tested for behaviors that don't depend on GraalVM bindings
 * (missing request/response, unknown endpoint passthrough, body writeback,
 * basic hits-to-docs conversion). The fieldTypes → multiValued behavior is
 * covered in hits-to-docs.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { transform } from './response.transform';
import { resolveFieldTypes } from './request.transform';
import type { JavaMap } from './context';

/** Build a minimal OpenSearch hits response body. */
function hitsPayload(hits: any[], total: number): JavaMap {
  const body = new Map<string, any>([
    ['hits', new Map<string, any>([
      ['hits', hits],
      ['total', new Map<string, any>([['value', total]])],
    ])],
  ]);
  const payload = new Map<string, any>([['inlinedJsonBody', body]]);
  return payload as unknown as JavaMap;
}

/** Build a minimal request JavaMap. */
function mockRequest(uri: string): JavaMap {
  return new Map<string, any>([['URI', uri]]) as unknown as JavaMap;
}

/** Build a minimal response JavaMap with a hits body. */
function mockResponse(hits: any[], total: number): JavaMap {
  return new Map<string, any>([['payload', hitsPayload(hits, total)]]) as unknown as JavaMap;
}

/** Build the bundled {request, response} msg that Java passes to the response transformer. */
function mockMsg(request: JavaMap, response: JavaMap): JavaMap {
  return new Map<string, any>([
    ['request', request],
    ['response', response],
  ]) as unknown as JavaMap;
}

describe('response transform', () => {
  // ─── Guard conditions ─────────────────────────────────────────────────────

  it('returns msg unchanged when request is missing', () => {
    const msg = new Map<string, any>([
      ['response', mockResponse([], 0)],
    ]) as unknown as JavaMap;
    const result = transform(msg);
    expect(result).toBe(msg);
  });

  it('returns msg unchanged when response is missing', () => {
    const msg = new Map<string, any>([
      ['request', mockRequest('/solr/test/select')],
    ]) as unknown as JavaMap;
    const result = transform(msg);
    expect(result).toBe(msg);
  });

  it('returns msg unchanged for unknown endpoint', () => {
    const request = mockRequest('/unknown/path');
    const response = mockResponse([], 0);
    const msg = mockMsg(request, response);
    const result = transform(msg);
    expect(result).toBe(msg);
  });

  // ─── Select endpoint — basic conversion ──────────────────────────────────

  it('returns the response object (not msg)', () => {
    const request = mockRequest('/solr/test/select');
    const response = mockResponse([], 0);
    const msg = mockMsg(request, response);
    const result = transform(msg);
    // response.transform returns the response, not the bundled msg
    expect(result).toBe(response);
  });

  it('writes inlinedJsonBody to response payload', () => {
    const request = mockRequest('/solr/test/select');
    const response = mockResponse([], 0);
    const msg = mockMsg(request, response);
    transform(msg);
    const payload = response.get('payload');
    expect(payload).toBeDefined();
    expect(payload.get('inlinedJsonBody')).toBeDefined();
  });

  it('converts hits to Solr response format', () => {
    const hit = new Map<string, any>([
      ['_id', 'doc-1'],
      ['_source', new Map([['title', 'Hello World']])],
    ]);
    const request = mockRequest('/solr/test/select');
    const response = mockResponse([hit], 1);
    const msg = mockMsg(request, response);
    transform(msg);

    const body = response.get('payload').get('inlinedJsonBody') as Map<string, any>;
    const solrResponse = body.get('response') as Map<string, any>;
    expect(solrResponse.get('numFound')).toBe(1);
    const docs = solrResponse.get('docs') as Map<string, any>[];
    expect(docs).toHaveLength(1);
    expect(docs[0].get('id')).toBe('doc-1');
  });

  it('removes OpenSearch metadata from response body', () => {
    const request = mockRequest('/solr/test/select');
    const response = mockResponse([], 0);
    const msg = mockMsg(request, response);
    transform(msg);

    const body = response.get('payload').get('inlinedJsonBody') as Map<string, any>;
    expect(body.has('hits')).toBe(false);
    expect(body.has('took')).toBe(false);
    expect(body.has('timed_out')).toBe(false);
    expect(body.has('_shards')).toBe(false);
  });

  it('wraps string fields in arrays when no fieldTypes configured (default behavior)', () => {
    const hit = new Map<string, any>([
      ['_id', 'doc-1'],
      ['_source', new Map([['status', 'active']])],
    ]);
    const request = mockRequest('/solr/test/select');
    const response = mockResponse([hit], 1);
    const msg = mockMsg(request, response);
    transform(msg);

    const body = response.get('payload').get('inlinedJsonBody') as Map<string, any>;
    const docs = (body.get('response') as Map<string, any>).get('docs') as Map<string, any>[];
    // No fieldTypes in test env → unknown field → wraps in array
    expect(docs[0].get('status')).toEqual(['active']);
  });

  it('creates payload map when response has no payload', () => {
    const request = mockRequest('/solr/test/select');
    // Response with no payload — need to add hits body manually
    const body = new Map<string, any>([
      ['hits', new Map<string, any>([
        ['hits', [] as any[]],
        ['total', new Map<string, any>([['value', 0]])],
      ])],
    ]);
    const response = new Map<string, any>([
      ['payload', new Map<string, any>([['inlinedJsonBody', body]])],
    ]) as unknown as JavaMap;
    const msg = mockMsg(request, response);
    transform(msg);
    expect(response.get('payload')).toBeDefined();
    expect(response.get('payload').get('inlinedJsonBody')).toBeDefined();
  });
});

describe('resolveFieldTypes (used by response.transform)', () => {
  it('returns empty map when bindings is undefined', () => {
    const result = resolveFieldTypes(undefined);
    expect(result.size).toBe(0);
  });

  it('returns empty map when bindings has no fieldTypes key', () => {
    const result = resolveFieldTypes({ solrConfig: {} });
    expect(result.size).toBe(0);
  });

  it('converts nested fieldTypes to ReadonlyMap with class and multiValued', () => {
    const fieldTypes = new Map([
      ['status', new Map([['class', 'solr.StrField'],  ['multiValued', 'false']])],
      ['tags',   new Map([['class', 'solr.StrField'],  ['multiValued', 'true' ]])],
      ['title',  new Map([['class', 'solr.TextField'], ['multiValued', 'false']])],
    ]);
    const result = resolveFieldTypes({ fieldTypes });

    expect(result.size).toBe(3);
    expect(result.get('status')!.get('multiValued')).toBe('false');
    expect(result.get('tags')!.get('multiValued')).toBe('true');
    expect(result.get('title')!.get('class')).toBe('solr.TextField');
  });

  it('returns the same empty singleton when no fieldTypes (no allocation)', () => {
    const a = resolveFieldTypes(undefined);
    const b = resolveFieldTypes({});
    expect(a).toBe(b);
  });
});
