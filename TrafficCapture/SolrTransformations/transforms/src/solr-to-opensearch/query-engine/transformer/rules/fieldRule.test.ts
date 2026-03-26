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

  it('transforms existence search field:* to exists query', () => {
    const node: FieldNode = {
      type: 'field',
      field: 'title',
      value: '*',
    };

    const result = fieldRule(node, stubTransformChild);

    expect(result).toEqual(
      new Map([['exists', new Map([['field', 'title']])]]),
    );
  });

  it('throws for wildcard pattern with ?', () => {
    const node: FieldNode = {
      type: 'field',
      field: 'title',
      value: 'te?t',
    };

    expect(() => fieldRule(node, stubTransformChild)).toThrow(
      "[fieldRule] Wildcard queries aren't supported yet. Query: title:te?t",
    );
  });

  it('throws for wildcard pattern with * in middle', () => {
    const node: FieldNode = {
      type: 'field',
      field: 'title',
      value: 'tes*ing',
    };

    expect(() => fieldRule(node, stubTransformChild)).toThrow(
      "[fieldRule] Wildcard queries aren't supported yet. Query: title:tes*ing",
    );
  });

  it('throws for prefix wildcard pattern', () => {
    const node: FieldNode = {
      type: 'field',
      field: 'title',
      value: 'test*',
    };

    expect(() => fieldRule(node, stubTransformChild)).toThrow(
      "[fieldRule] Wildcard queries aren't supported yet. Query: title:test*",
    );
  });

  it('throws for fuzzy search pattern', () => {
    const node: FieldNode = {
      type: 'field',
      field: 'title',
      value: 'roam~',
    };

    expect(() => fieldRule(node, stubTransformChild)).toThrow(
      "[fieldRule] Fuzzy queries aren't supported yet. Query: title:roam~",
    );
  });

  it('throws for fuzzy search with distance', () => {
    const node: FieldNode = {
      type: 'field',
      field: 'title',
      value: 'roam~1',
    };

    expect(() => fieldRule(node, stubTransformChild)).toThrow(
      "[fieldRule] Fuzzy queries aren't supported yet. Query: title:roam~1",
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
      '[fieldRule] Called with wrong node type: range',
    );
  });
});
