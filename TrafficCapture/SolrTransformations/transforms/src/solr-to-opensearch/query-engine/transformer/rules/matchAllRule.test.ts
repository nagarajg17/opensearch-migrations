import { describe, it, expect } from 'vitest';
import { matchAllRule } from './matchAllRule';
import type { MatchAllNode, FieldNode } from '../../ast/nodes';

/** Stub transformChild — not used by matchAllRule but required by signature. */
const stubTransformChild = () => new Map();

describe('matchAllRule', () => {
  it('transforms matchAll to match_all query', () => {
    const node: MatchAllNode = { type: 'matchAll' };

    const result = matchAllRule(node, stubTransformChild);

    expect(result).toEqual(new Map([['match_all', new Map()]]));
  });

  it('returns empty Map as match_all value', () => {
    const node: MatchAllNode = { type: 'matchAll' };

    const result = matchAllRule(node, stubTransformChild);
    const matchAllValue = result.get('match_all');

    expect(matchAllValue).toBeInstanceOf(Map);
    expect(matchAllValue.size).toBe(0);
  });

  it('throws when called with wrong node type', () => {
    const wrongNode: FieldNode = {
      type: 'field',
      field: 'title',
      value: 'java',
    };

    expect(() => matchAllRule(wrongNode, stubTransformChild)).toThrow(
      'matchAllRule called with wrong node type: field',
    );
  });
});
