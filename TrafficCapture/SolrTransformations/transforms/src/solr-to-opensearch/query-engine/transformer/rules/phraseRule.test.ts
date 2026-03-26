import { describe, it, expect } from 'vitest';
import { phraseRule } from './phraseRule';
import type { PhraseNode, FieldNode } from '../../ast/nodes';

/** Stub transformChild — not used by phraseRule but required by signature. */
const stubTransformChild = () => new Map();

describe('phraseRule', () => {
  it('transforms explicit phrase to match_phrase query', () => {
    const node: PhraseNode = {
      type: 'phrase',
      field: 'title',
      text: 'hello world',
    };

    const result = phraseRule(node, stubTransformChild);

    expect(result).toEqual(
      new Map([['match_phrase', new Map([['title', new Map([['query', 'hello world']])]])]]),
    );
  });

  it('preserves field name in output', () => {
    const node: PhraseNode = {
      type: 'phrase',
      field: 'description',
      text: 'search engine',
    };

    const result = phraseRule(node, stubTransformChild);
    const matchPhraseMap = result.get('match_phrase') as Map<string, any>;

    expect(matchPhraseMap.has('description')).toBe(true);
    expect(matchPhraseMap.get('description').get('query')).toBe('search engine');
  });

  it('handles empty phrase text', () => {
    const node: PhraseNode = {
      type: 'phrase',
      field: 'content',
      text: '',
    };

    const result = phraseRule(node, stubTransformChild);

    expect(result).toEqual(
      new Map([['match_phrase', new Map([['content', new Map([['query', '']])]])]]),
    );
  });

  it('handles phrase with special characters', () => {
    const node: PhraseNode = {
      type: 'phrase',
      field: 'title',
      text: 'hello "world" & friends',
    };

    const result = phraseRule(node, stubTransformChild);

    expect(result).toEqual(
      new Map([['match_phrase', new Map([['title', new Map([['query', 'hello "world" & friends']])]])]]),
    );
  });

  it('throws for proximity/slop pattern with ~N', () => {
    const node: PhraseNode = {
      type: 'phrase',
      field: 'title',
      text: 'jakarta apache~10',
    };

    expect(() => phraseRule(node, stubTransformChild)).toThrow(
      "[phraseRule] Proximity/slop queries aren't supported yet. Query: title:\"jakarta apache~10\"",
    );
  });

  it('throws for proximity/slop pattern with ~ only', () => {
    const node: PhraseNode = {
      type: 'phrase',
      field: 'description',
      text: 'hello world~',
    };

    expect(() => phraseRule(node, stubTransformChild)).toThrow(
      "[phraseRule] Proximity/slop queries aren't supported yet. Query: description:\"hello world~\"",
    );
  });

  it('throws when called with wrong node type', () => {
    const wrongNode: FieldNode = {
      type: 'field',
      field: 'title',
      value: 'java',
    };

    expect(() => phraseRule(wrongNode, stubTransformChild)).toThrow(
      '[phraseRule] Called with wrong node type: field',
    );
  });
});
