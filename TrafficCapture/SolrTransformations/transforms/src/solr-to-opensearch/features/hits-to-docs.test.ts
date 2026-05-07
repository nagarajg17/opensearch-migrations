/**
 * Unit tests for hits-to-docs.ts — converts OpenSearch hits to Solr response.docs format.
 */
import { describe, it, expect } from 'vitest';
import { response as hitsToDocs } from './hits-to-docs';
import type { ResponseContext, JavaMap } from '../context';

/** Build a minimal ResponseContext for testing. */
function mockCtx(
  hitsBody: Record<string, any>,
  fieldTypes: ReadonlyMap<string, JavaMap> = new Map(),
  requestParams: Record<string, string> = {},
): ResponseContext {
  const responseBody = new Map(Object.entries(hitsBody)) as unknown as JavaMap;
  const params = new URLSearchParams(requestParams);
  return {
    request: new Map() as unknown as JavaMap,
    response: new Map() as unknown as JavaMap,
    endpoint: 'select',
    collection: 'test',
    requestParams: params,
    responseBody,
    fieldTypes,
  };
}

/** Build a single OpenSearch hit as a JavaMap. */
function mockHit(id: string, source: Record<string, any>, version?: number): JavaMap {
  const hit = new Map<string, any>([
    ['_id', id],
    ['_source', new Map(Object.entries(source))],
  ]);
  if (version !== undefined) hit.set('_version', version);
  return hit as unknown as JavaMap;
}

/** Build the hits body that OpenSearch returns. */
function hitsBody(hits: JavaMap[], total: number): Record<string, any> {
  return {
    hits: new Map<string, any>([
      ['hits', hits],
      ['total', new Map<string, any>([['value', total]])],
    ]),
  };
}

describe('hits-to-docs', () => {
  it('has correct name', () => {
    expect(hitsToDocs.name).toBe('hits-to-docs');
  });

  it('matches when responseBody has hits', () => {
    const ctx = mockCtx(hitsBody([], 0));
    expect(hitsToDocs.match!(ctx)).toBe(true);
  });

  it('does not match when responseBody has no hits', () => {
    const ctx = mockCtx({ response: new Map() });
    expect(hitsToDocs.match!(ctx)).toBe(false);
  });

  // ─── numFound / start ─────────────────────────────────────────────────────

  it('sets numFound from total.value', () => {
    const ctx = mockCtx(hitsBody([], 42));
    hitsToDocs.apply(ctx);
    const resp = ctx.responseBody.get('response') as Map<string, any>;
    expect(resp.get('numFound')).toBe(42);
  });

  it('sets start from request params', () => {
    const ctx = mockCtx(hitsBody([], 0), new Map(), { start: '10' });
    hitsToDocs.apply(ctx);
    const resp = ctx.responseBody.get('response') as Map<string, any>;
    expect(resp.get('start')).toBe(10);
  });

  it('sets start to 0 when cursorMark is present', () => {
    const ctx = mockCtx(hitsBody([], 0), new Map(), { start: '10', cursorMark: '*' });
    hitsToDocs.apply(ctx);
    const resp = ctx.responseBody.get('response') as Map<string, any>;
    expect(resp.get('start')).toBe(0);
  });

  it('sets numFoundExact to true', () => {
    const ctx = mockCtx(hitsBody([], 0));
    hitsToDocs.apply(ctx);
    const resp = ctx.responseBody.get('response') as Map<string, any>;
    expect(resp.get('numFoundExact')).toBe(true);
  });

  // ─── OpenSearch metadata cleanup ─────────────────────────────────────────

  it('removes hits, took, timed_out, _shards from responseBody', () => {
    const body = {
      ...hitsBody([], 0),
      took: 5,
      timed_out: false,
      _shards: new Map([['total', 5]]),
    };
    const ctx = mockCtx(body);
    hitsToDocs.apply(ctx);
    expect(ctx.responseBody.has('hits')).toBe(false);
    expect(ctx.responseBody.has('took')).toBe(false);
    expect(ctx.responseBody.has('timed_out')).toBe(false);
    expect(ctx.responseBody.has('_shards')).toBe(false);
  });

  // ─── hitToDoc — id handling ───────────────────────────────────────────────

  it('sets id from _id', () => {
    const hit = mockHit('doc-1', { title: 'hello' });
    const ctx = mockCtx(hitsBody([hit], 1));
    hitsToDocs.apply(ctx);
    const docs = (ctx.responseBody.get('response') as Map<string, any>).get('docs') as Map<string, any>[];
    expect(docs[0].get('id')).toBe('doc-1');
  });

  it('does not duplicate id from _source', () => {
    const hit = mockHit('doc-1', { id: 'doc-1', title: 'hello' });
    const ctx = mockCtx(hitsBody([hit], 1));
    hitsToDocs.apply(ctx);
    const docs = (ctx.responseBody.get('response') as Map<string, any>).get('docs') as Map<string, any>[];
    // id should come from _id, not be duplicated from _source
    expect(docs[0].get('id')).toBe('doc-1');
  });

  it('sets _version_ from _version when present', () => {
    const hit = mockHit('doc-1', { title: 'hello' }, 12345);
    const ctx = mockCtx(hitsBody([hit], 1));
    hitsToDocs.apply(ctx);
    const docs = (ctx.responseBody.get('response') as Map<string, any>).get('docs') as Map<string, any>[];
    expect(docs[0].get('_version_')).toBe(12345);
  });

  it('sets _version_ to 0 when _version is absent', () => {
    const hit = mockHit('doc-1', { title: 'hello' });
    const ctx = mockCtx(hitsBody([hit], 1));
    hitsToDocs.apply(ctx);
    const docs = (ctx.responseBody.get('response') as Map<string, any>).get('docs') as Map<string, any>[];
    expect(docs[0].get('_version_')).toBe(0);
  });

  // ─── shouldWrapInArray — multiValued ─────────────────────────────────────

  it('wraps string in array when field is unknown (no fieldTypes)', () => {
    const hit = mockHit('1', { status: 'active' });
    const ctx = mockCtx(hitsBody([hit], 1));
    hitsToDocs.apply(ctx);
    const docs = (ctx.responseBody.get('response') as Map<string, any>).get('docs') as Map<string, any>[];
    expect(docs[0].get('status')).toEqual(['active']);
  });

  it('wraps string in array when multiValued is true', () => {
    const fieldTypes = new Map([['tags', new Map([['class', 'solr.StrField'], ['multiValued', 'true']])]]);
    const hit = mockHit('1', { tags: 'java' });
    const ctx = mockCtx(hitsBody([hit], 1), fieldTypes);
    hitsToDocs.apply(ctx);
    const docs = (ctx.responseBody.get('response') as Map<string, any>).get('docs') as Map<string, any>[];
    expect(docs[0].get('tags')).toEqual(['java']);
  });

  it('returns scalar when multiValued is false', () => {
    const fieldTypes = new Map([['status', new Map([['class', 'solr.StrField'], ['multiValued', 'false']])]]);
    const hit = mockHit('1', { status: 'active' });
    const ctx = mockCtx(hitsBody([hit], 1), fieldTypes);
    hitsToDocs.apply(ctx);
    const docs = (ctx.responseBody.get('response') as Map<string, any>).get('docs') as Map<string, any>[];
    expect(docs[0].get('status')).toBe('active');
  });

  it('returns scalar for numeric value when multiValued is false', () => {
    const fieldTypes = new Map([['rating', new Map([['class', 'solr.IntPointField'], ['multiValued', 'false']])]]);
    const hit = mockHit('1', { rating: 5 });
    const ctx = mockCtx(hitsBody([hit], 1), fieldTypes);
    hitsToDocs.apply(ctx);
    const docs = (ctx.responseBody.get('response') as Map<string, any>).get('docs') as Map<string, any>[];
    expect(docs[0].get('rating')).toBe(5);
  });

  it('returns scalar for numeric value even when multiValued is true (number heuristic bypasses shouldWrapInArray)', () => {
    // Numbers always return scalar — the typeof check takes precedence over multiValued
    const fieldTypes = new Map([['scores', new Map([['class', 'solr.IntPointField'], ['multiValued', 'true']])]]);
    const hit = mockHit('1', { scores: 42 });
    const ctx = mockCtx(hitsBody([hit], 1), fieldTypes);
    hitsToDocs.apply(ctx);
    const docs = (ctx.responseBody.get('response') as Map<string, any>).get('docs') as Map<string, any>[];
    expect(docs[0].get('scores')).toBe(42);
  });

  it('returns scalar for boolean value even when multiValued is true (boolean heuristic bypasses shouldWrapInArray)', () => {
    // Booleans always return scalar — the typeof check takes precedence over multiValued
    const fieldTypes = new Map([['active', new Map([['class', 'solr.BoolField'], ['multiValued', 'true']])]]);
    const hit = mockHit('1', { active: true });
    const ctx = mockCtx(hitsBody([hit], 1), fieldTypes);
    hitsToDocs.apply(ctx);
    const docs = (ctx.responseBody.get('response') as Map<string, any>).get('docs') as Map<string, any>[];
    expect(docs[0].get('active')).toBe(true);
  });

  it('returns scalar for numeric value when no fieldTypes (number heuristic, no schema)', () => {
    const hit = mockHit('1', { rating: 5 });
    const ctx = mockCtx(hitsBody([hit], 1));
    hitsToDocs.apply(ctx);
    const docs = (ctx.responseBody.get('response') as Map<string, any>).get('docs') as Map<string, any>[];
    expect(docs[0].get('rating')).toBe(5);
  });

  it('keeps already-array values as-is regardless of multiValued', () => {
    const fieldTypes = new Map([['tags', new Map([['class', 'solr.StrField'], ['multiValued', 'false']])]]);
    const hit = mockHit('1', { tags: ['java', 'python'] });
    const ctx = mockCtx(hitsBody([hit], 1), fieldTypes);
    hitsToDocs.apply(ctx);
    const docs = (ctx.responseBody.get('response') as Map<string, any>).get('docs') as Map<string, any>[];
    expect(docs[0].get('tags')).toEqual(['java', 'python']);
  });

  // ─── Multiple docs ────────────────────────────────────────────────────────

  it('converts multiple hits to docs', () => {
    const hits = [
      mockHit('1', { title: 'First' }),
      mockHit('2', { title: 'Second' }),
    ];
    const ctx = mockCtx(hitsBody(hits, 2));
    hitsToDocs.apply(ctx);
    const docs = (ctx.responseBody.get('response') as Map<string, any>).get('docs') as Map<string, any>[];
    expect(docs).toHaveLength(2);
    expect(docs[0].get('id')).toBe('1');
    expect(docs[1].get('id')).toBe('2');
  });
});
