import { describe, it, expect } from 'vitest';
import { groupRule } from './groupRule';
import type { ASTNode, GroupNode, FieldNode, BoolNode } from '../../ast/nodes';
import type { TransformChild } from '../types';

/** Stub transformChild that wraps each node in a Map with its type as key. */
const stubTransformChild: TransformChild = (child: ASTNode): Map<string, any> =>
  new Map([[child.type, child]]);

const titleJava: FieldNode = { type: 'field', field: 'title', value: 'java' };
const titlePython: FieldNode = { type: 'field', field: 'title', value: 'python' };

describe('groupRule', () => {
  it('unwraps group and transforms child', () => {
    const node: GroupNode = { type: 'group', child: titleJava };
    const result = groupRule(node, stubTransformChild);
    expect(result).toEqual(new Map([['field', titleJava]]));
  });

  it('passes through nested bool node', () => {
    const boolChild: BoolNode = {
      type: 'bool',
      and: [],
      or: [titleJava, titlePython],
      not: [],
    };
    const node: GroupNode = { type: 'group', child: boolChild };
    const result = groupRule(node, stubTransformChild);
    expect(result).toEqual(new Map([['bool', boolChild]]));
  });

  it('calls transformChild exactly once', () => {
    const calls: ASTNode[] = [];
    const trackingTransformChild: TransformChild = (child) => {
      calls.push(child);
      return new Map([[child.type, child]]);
    };

    const node: GroupNode = { type: 'group', child: titleJava };
    groupRule(node, trackingTransformChild);

    expect(calls).toEqual([titleJava]);
  });

  it('throws when called with wrong node type', () => {
    const wrongNode: FieldNode = { type: 'field', field: 'title', value: 'java' };
    expect(() => groupRule(wrongNode, stubTransformChild)).toThrow(
      'groupRule called with wrong node type: field',
    );
  });
});
