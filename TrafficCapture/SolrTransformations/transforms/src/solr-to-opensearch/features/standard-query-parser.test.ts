import { describe, it, expect } from 'vitest';
import { request } from './standard-query-parser';
import type { RequestContext, JavaMap } from '../context';

function createMockContext(q: string): RequestContext {
  const params = new URLSearchParams();
  params.set('q', q);
  return {
    endpoint: 'select',
    collection: 'test',
    params,
    body: new Map() as unknown as JavaMap,
    msg: new Map() as unknown as JavaMap,
  };
}

function mapToObject(map: JavaMap): unknown {
  if (!(map instanceof Map)) return map;
  const obj: Record<string, unknown> = {};
  for (const [k, v] of map.entries()) {
    obj[k] = v instanceof Map ? mapToObject(v) : v;
  }
  return obj;
}

function applyAndGetQuery(q: string): unknown {
  const ctx = createMockContext(q);
  request.apply(ctx);
  return mapToObject(ctx.body.get('query') as JavaMap);
}

describe('standard-query-parser', () => {
  it('match_all for *:*', () => {
    expect(applyAndGetQuery('*:*')).toEqual({ match_all: {} });
  });

  it('match_all for empty query', () => {
    expect(applyAndGetQuery('')).toEqual({ match_all: {} });
  });

  it('simple term query', () => {
    expect(applyAndGetQuery('title:search')).toEqual({ term: { title: 'search' } });
  });

  it('AND boolean query', () => {
    expect(applyAndGetQuery('title:search AND author:john')).toEqual({
      bool: {
        must: [{ term: { title: 'search' } }, { term: { author: 'john' } }],
      },
    });
  });

  it('OR boolean query', () => {
    expect(applyAndGetQuery('title:test OR content:example')).toEqual({
      bool: {
        should: [{ term: { title: 'test' } }, { term: { content: 'example' } }],
      },
    });
  });

  it('NOT boolean query', () => {
    expect(applyAndGetQuery('title:search NOT status:draft')).toEqual({
      bool: {
        must: [{ term: { title: 'search' } }],
        must_not: [{ term: { status: 'draft' } }],
      },
    });
  });

  it('inclusive range query', () => {
    expect(applyAndGetQuery('price:[10 TO 100]')).toEqual({
      range: { price: { gte: '10', lte: '100' } },
    });
  });

  it('exclusive range query', () => {
    expect(applyAndGetQuery('price:{10 TO 100}')).toEqual({
      range: { price: { gt: '10', lt: '100' } },
    });
  });

  it('phrase query', () => {
    expect(applyAndGetQuery('title:"hello world"')).toEqual({
      match_phrase: { title: 'hello world' },
    });
  });

  it('boosted term query', () => {
    expect(applyAndGetQuery('title:search^2')).toEqual({
      term: { title: { value: 'search', boost: 2 } },
    });
  });

  it('required prefix (+)', () => {
    expect(applyAndGetQuery('+title:required -status:excluded')).toEqual({
      bool: {
        must: [{ term: { title: 'required' } }],
        must_not: [{ term: { status: 'excluded' } }],
      },
    });
  });
});
