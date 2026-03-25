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

  it('transforms defaultField phrase with _text_ to query_string without default_field', () => {
    const node: PhraseNode = {
      type: 'phrase',
      field: '_text_',
      text: 'hello world',
      defaultField: true,
    };

    const result = phraseRule(node, stubTransformChild);

    expect(result).toEqual(
      new Map([['query_string', new Map([['query', 'hello world']])]]),
    );
  });

  it('transforms defaultField phrase with custom df to query_string with that field', () => {
    const node: PhraseNode = {
      type: 'phrase',
      field: 'content',
      text: 'hello world',
      defaultField: true,
    };

    const result = phraseRule(node, stubTransformChild);

    expect(result).toEqual(
      new Map([['query_string', new Map([['query', 'hello world'], ['default_field', 'content']])]]),
    );
  });

  it('throws when called with wrong node type', () => {
    const wrongNode: FieldNode = {
      type: 'field',
      field: 'title',
      value: 'java',
    };

    expect(() => phraseRule(wrongNode, stubTransformChild)).toThrow(
      'phraseRule called with wrong node type: field',
    );
  });
});
