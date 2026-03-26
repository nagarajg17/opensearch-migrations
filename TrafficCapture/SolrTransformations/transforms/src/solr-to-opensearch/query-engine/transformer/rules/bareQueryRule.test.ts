import { describe, it, expect } from 'vitest';
import { bareQueryRule } from './bareQueryRule';
import type { BareQueryNode, FieldNode } from '../../ast/nodes';

/** Stub transformChild — not used by bareQueryRule but required by signature. */
const stubTransformChild = () => new Map();

describe('bareQueryRule', () => {
  it('transforms bare term without defaultField to query_string', () => {
    const node: BareQueryNode = {
      type: 'bareQuery',
      query: 'java',
      isPhrase: false,
    };

    const result = bareQueryRule(node, stubTransformChild);

    expect(result).toEqual(
      new Map([['query_string', new Map([['query', 'java']])]]),
    );
  });

  it('transforms bare term with defaultField to query_string with default_field', () => {
    const node: BareQueryNode = {
      type: 'bareQuery',
      query: 'java',
      isPhrase: false,
      defaultField: 'content',
    };

    const result = bareQueryRule(node, stubTransformChild);

    expect(result).toEqual(
      new Map([['query_string', new Map([['query', 'java'], ['default_field', 'content']])]]),
    );
  });

  it('transforms bare phrase without defaultField to query_string with quotes', () => {
    const node: BareQueryNode = {
      type: 'bareQuery',
      query: 'hello world',
      isPhrase: true,
    };

    const result = bareQueryRule(node, stubTransformChild);

    expect(result).toEqual(
      new Map([['query_string', new Map([['query', '"hello world"']])]]),
    );
  });

  it('transforms bare phrase with defaultField to query_string with quotes and default_field', () => {
    const node: BareQueryNode = {
      type: 'bareQuery',
      query: 'hello world',
      isPhrase: true,
      defaultField: 'title',
    };

    const result = bareQueryRule(node, stubTransformChild);

    expect(result).toEqual(
      new Map([['query_string', new Map([['query', '"hello world"'], ['default_field', 'title']])]]),
    );
  });

  it('handles empty query string for term', () => {
    const node: BareQueryNode = {
      type: 'bareQuery',
      query: '',
      isPhrase: false,
    };

    const result = bareQueryRule(node, stubTransformChild);

    expect(result).toEqual(
      new Map([['query_string', new Map([['query', '']])]]),
    );
  });

  it('handles empty query string for phrase', () => {
    const node: BareQueryNode = {
      type: 'bareQuery',
      query: '',
      isPhrase: true,
    };

    const result = bareQueryRule(node, stubTransformChild);

    expect(result).toEqual(
      new Map([['query_string', new Map([['query', '""']])]]),
    );
  });

  it('throws when called with wrong node type', () => {
    const wrongNode: FieldNode = {
      type: 'field',
      field: 'title',
      value: 'java',
    };

    expect(() => bareQueryRule(wrongNode, stubTransformChild)).toThrow(
      '[bareQueryRule] Called with wrong node type: field',
    );
  });
});
