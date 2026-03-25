import { describe, it, expect } from 'vitest';
import { fieldRule } from './fieldRule';
import type { FieldNode, RangeNode } from '../../ast/nodes';

/** Stub transformChild — not used by fieldRule but required by signature. */
const stubTransformChild = () => new Map();

describe('fieldRule', () => {
  it('transforms explicit field:value to term query', () => {
    const node: FieldNode = {
      type: 'field',
      field: 'title',
      value: 'java',
    };

    const result = fieldRule(node, stubTransformChild);

    expect(result).toEqual(
      new Map([['term', new Map([['title', new Map([['value', 'java']])]])]]),
    );
  });

  it('preserves field name in output', () => {
    const node: FieldNode = {
      type: 'field',
      field: 'author',
      value: 'smith',
    };

    const result = fieldRule(node, stubTransformChild);
    const termMap = result.get('term') as Map<string, any>;

    expect(termMap.has('author')).toBe(true);
    expect(termMap.get('author').get('value')).toBe('smith');
  });

  it('handles underscore field names', () => {
    const node: FieldNode = {
      type: 'field',
      field: '_text_',
      value: 'search',
    };

    const result = fieldRule(node, stubTransformChild);

    expect(result).toEqual(
      new Map([['term', new Map([['_text_', new Map([['value', 'search']])]])]]),
    );
  });

  it('handles dotted field names', () => {
    const node: FieldNode = {
      type: 'field',
      field: 'metadata.author',
      value: 'doe',
    };

    const result = fieldRule(node, stubTransformChild);

    expect(result).toEqual(
      new Map([['term', new Map([['metadata.author', new Map([['value', 'doe']])]])]]),
    );
  });

  it('transforms defaultField with _text_ to query_string without default_field', () => {
    const node: FieldNode = {
      type: 'field',
      field: '_text_',
      value: 'java',
      defaultField: true,
    };

    const result = fieldRule(node, stubTransformChild);

    expect(result).toEqual(
      new Map([['query_string', new Map([['query', 'java']])]]),
    );
  });

  it('transforms defaultField with custom df to query_string with that field', () => {
    const node: FieldNode = {
      type: 'field',
      field: 'content',
      value: 'java',
      defaultField: true,
    };

    const result = fieldRule(node, stubTransformChild);

    expect(result).toEqual(
      new Map([['query_string', new Map([['query', 'java'], ['default_field', 'content']])]]),
    );
  });

  it('throws when called with wrong node type', () => {
    const wrongNode: RangeNode = {
      type: 'range',
      field: 'price',
      lower: '10',
      upper: '100',
      lowerInclusive: true,
      upperInclusive: true,
    };
    expect(() => fieldRule(wrongNode, stubTransformChild)).toThrow(
      'fieldRule called with wrong node type: range',
    );
  });
});
