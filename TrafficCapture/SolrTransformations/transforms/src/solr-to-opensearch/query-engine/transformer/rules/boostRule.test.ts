import { describe, it, expect } from 'vitest';
import { transformNode } from '../astToOpenSearch';
import { boostRule } from './boostRule';
import type { ASTNode, BoostNode, FieldNode, PhraseNode, RangeNode, BareQueryNode, BoolNode, MatchAllNode } from '../../ast/nodes';
import type { TransformChild } from '../types';

/** Helper to create Map<string, any> with mixed value types */
const m = (entries: [string, any][]): Map<string, any> => new Map(entries);

describe('boostRule', () => {
  describe('field-level boost (term, match_phrase, range)', () => {
    it('adds boost to term query', () => {
      const node: BoostNode = {
        type: 'boost',
        value: 2,
        child: { type: 'field', field: 'title', value: 'java' } as FieldNode,
      };

      const result = transformNode(node);

      expect(result).toEqual(m([['term', m([['title', m([['value', 'java'], ['boost', 2]])]])]]));
    });

    it('adds boost to match_phrase query', () => {
      const node: BoostNode = {
        type: 'boost',
        value: 1.5,
        child: { type: 'phrase', field: 'title', text: 'hello world' } as PhraseNode,
      };

      const result = transformNode(node);

      expect(result).toEqual(m([['match_phrase', m([['title', m([['query', 'hello world'], ['boost', 1.5]])]])]]));
    });

    it('adds boost to range query', () => {
      const node: BoostNode = {
        type: 'boost',
        value: 2,
        child: {
          type: 'range',
          field: 'price',
          lower: '10',
          upper: '100',
          lowerInclusive: true,
          upperInclusive: true,
        } as RangeNode,
      };

      const result = transformNode(node);

      expect(result).toEqual(m([['range', m([['price', m([['gte', '10'], ['lte', '100'], ['boost', 2]])]])]]));
    });
  });

  describe('query-level boost (query_string, bool, exists, match_all)', () => {
    it('adds boost to query_string (bare term)', () => {
      const node: BoostNode = {
        type: 'boost',
        value: 2,
        child: { type: 'bareQuery', query: 'java', isPhrase: false } as BareQueryNode,
      };

      const result = transformNode(node);

      expect(result).toEqual(m([['query_string', m([['query', 'java'], ['boost', 2]])]]));
    });

    it('adds boost to bool query', () => {
      const node: BoostNode = {
        type: 'boost',
        value: 2,
        child: {
          type: 'bool',
          and: [{ type: 'field', field: 'title', value: 'java' } as FieldNode],
          or: [],
          not: [],
        } as BoolNode,
      };

      const result = transformNode(node);
      const boolMap = result.get('bool') as Map<string, any>;

      expect(boolMap.get('boost')).toBe(2);
      expect(boolMap.has('must')).toBe(true);
    });

    it('adds boost to exists query (field:*)', () => {
      const node: BoostNode = {
        type: 'boost',
        value: 2,
        child: { type: 'field', field: 'title', value: '*' } as FieldNode,
      };

      const result = transformNode(node);

      expect(result).toEqual(m([['exists', m([['field', 'title'], ['boost', 2]])]]));
    });

    it('adds boost to match_all query', () => {
      const node: BoostNode = {
        type: 'boost',
        value: 2,
        child: { type: 'matchAll' } as MatchAllNode,
      };

      const result = transformNode(node);

      expect(result).toEqual(m([['match_all', m([['boost', 2]])]]));
    });
  });

  describe('edge cases', () => {
    it('handles decimal boost values', () => {
      const node: BoostNode = {
        type: 'boost',
        value: 0.5,
        child: { type: 'field', field: 'title', value: 'java' } as FieldNode,
      };

      const result = transformNode(node);
      const termMap = result.get('term') as Map<string, any>;
      const fieldMap = termMap.get('title') as Map<string, any>;

      expect(fieldMap.get('boost')).toBe(0.5);
    });

    it('preserves default_field when boosting bare query', () => {
      const node: BoostNode = {
        type: 'boost',
        value: 2,
        child: { type: 'bareQuery', query: 'java', isPhrase: false, defaultField: 'content' } as BareQueryNode,
      };

      const result = transformNode(node);

      expect(result).toEqual(m([['query_string', m([['query', 'java'], ['default_field', 'content'], ['boost', 2]])]]));
    });

    it('calls transformChild exactly once', () => {
      const calls: ASTNode[] = [];
      const trackingTransformChild: TransformChild = (child) => {
        calls.push(child);
        return m([['term', m([['title', m([['value', 'java']])]])]]);
      };

      const childNode: FieldNode = { type: 'field', field: 'title', value: 'java' };
      const node: BoostNode = { type: 'boost', value: 2, child: childNode };

      boostRule(node, trackingTransformChild);

      expect(calls).toHaveLength(1);
      expect(calls[0]).toBe(childNode);
    });

    it('throws when called with wrong node type', () => {
      const stubTransformChild: TransformChild = () => m([]);
      const wrongNode: FieldNode = { type: 'field', field: 'title', value: 'java' };

      expect(() => boostRule(wrongNode, stubTransformChild)).toThrow(
        '[boostRule] Called with wrong node type: field',
      );
    });
  });
});
