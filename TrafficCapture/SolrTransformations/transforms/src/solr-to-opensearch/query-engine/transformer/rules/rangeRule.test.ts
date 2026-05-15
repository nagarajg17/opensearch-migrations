import { describe, it, expect } from 'vitest';
import { rangeRule } from './rangeRule';
import type { RangeNode } from '../../ast/nodes';

/** Stub transformChild — not used by rangeRule but required by signature. */
const stubTransformChild = () => new Map();

describe('rangeRule', () => {
  it('transforms inclusive range [10 TO 100] to gte/lte', () => {
    const node: RangeNode = {
      type: 'range',
      field: 'price',
      lower: '10',
      upper: '100',
      lowerInclusive: true,
      upperInclusive: true,
    };

    const result = rangeRule(node, stubTransformChild);

    expect(result).toEqual(
      new Map([['range', new Map([['price', new Map([['gte', '10'], ['lte', '100']])]])]]),
    );
  });

  it('transforms exclusive range {10 TO 100} to gt/lt', () => {
    const node: RangeNode = {
      type: 'range',
      field: 'price',
      lower: '10',
      upper: '100',
      lowerInclusive: false,
      upperInclusive: false,
    };

    const result = rangeRule(node, stubTransformChild);

    expect(result).toEqual(
      new Map([['range', new Map([['price', new Map([['gt', '10'], ['lt', '100']])]])]]),
    );
  });

  it('transforms mixed range [10 TO 100} to gte/lt', () => {
    const node: RangeNode = {
      type: 'range',
      field: 'price',
      lower: '10',
      upper: '100',
      lowerInclusive: true,
      upperInclusive: false,
    };

    const result = rangeRule(node, stubTransformChild);

    expect(result).toEqual(
      new Map([['range', new Map([['price', new Map([['gte', '10'], ['lt', '100']])]])]]),
    );
  });

  it('transforms mixed range {10 TO 100] to gt/lte', () => {
    const node: RangeNode = {
      type: 'range',
      field: 'price',
      lower: '10',
      upper: '100',
      lowerInclusive: false,
      upperInclusive: true,
    };

    const result = rangeRule(node, stubTransformChild);

    expect(result).toEqual(
      new Map([['range', new Map([['price', new Map([['gt', '10'], ['lte', '100']])]])]]),
    );
  });

  it('omits lower bound when unbounded [* TO 100]', () => {
    const node: RangeNode = {
      type: 'range',
      field: 'price',
      lower: '*',
      upper: '100',
      lowerInclusive: true,
      upperInclusive: true,
    };

    const result = rangeRule(node, stubTransformChild);

    expect(result).toEqual(
      new Map([['range', new Map([['price', new Map([['lte', '100']])]])]]),
    );
  });

  it('omits upper bound when unbounded [10 TO *]', () => {
    const node: RangeNode = {
      type: 'range',
      field: 'price',
      lower: '10',
      upper: '*',
      lowerInclusive: true,
      upperInclusive: true,
    };

    const result = rangeRule(node, stubTransformChild);

    expect(result).toEqual(
      new Map([['range', new Map([['price', new Map([['gte', '10']])]])]]),
    );
  });

  it('converts fully unbounded [* TO *] to exists query', () => {
    const node: RangeNode = {
      type: 'range',
      field: 'price',
      lower: '*',
      upper: '*',
      lowerInclusive: true,
      upperInclusive: true,
    };

    const result = rangeRule(node, stubTransformChild);

    expect(result).toEqual(
      new Map([['exists', new Map([['field', 'price']])]]),
    );
  });

  it('preserves field name in output', () => {
    const node: RangeNode = {
      type: 'range',
      field: 'created_at',
      lower: '2024-01-01',
      upper: '2024-12-31',
      lowerInclusive: true,
      upperInclusive: true,
    };

    const result = rangeRule(node, stubTransformChild);
    const rangeMap = result.get('range') as Map<string, any>;

    expect(rangeMap.has('created_at')).toBe(true);
  });
});

// ─── Date range tests ────────────────────────────────────────────────────────

describe('rangeRule — date bounds', () => {
  it('passes through plain ISO date strings unchanged', () => {
    const node: RangeNode = {
      type: 'range',
      field: 'event_date',
      lower: '2024-01-01T00:00:00Z',
      upper: '2024-12-31T23:59:59Z',
      lowerInclusive: true,
      upperInclusive: true,
    };

    expect(rangeRule(node, stubTransformChild)).toEqual(
      new Map([['range', new Map([['event_date', new Map([
        ['gte', '2024-01-01T00:00:00Z'],
        ['lte', '2024-12-31T23:59:59Z'],
      ])]])]]),
    );
  });

  it('passes through ISO date with open lower bound [* TO date]', () => {
    const node: RangeNode = {
      type: 'range',
      field: 'event_date',
      lower: '*',
      upper: '2024-12-31T23:59:59Z',
      lowerInclusive: true,
      upperInclusive: false,
    };

    expect(rangeRule(node, stubTransformChild)).toEqual(
      new Map([['range', new Map([['event_date', new Map([
        ['lt', '2024-12-31T23:59:59Z'],
      ])]])]]),
    );
  });
});

// ─── Date-math range tests ───────────────────────────────────────────────────

describe('rangeRule — date-math bounds', () => {
  it('translates bare NOW to now', () => {
    const node: RangeNode = {
      type: 'range',
      field: 'event_date',
      lower: 'NOW',
      upper: '*',
      lowerInclusive: true,
      upperInclusive: true,
    };

    expect(rangeRule(node, stubTransformChild)).toEqual(
      new Map([['range', new Map([['event_date', new Map([
        ['gte', 'now'],
      ])]])]]),
    );
  });

  it('translates NOW-7DAYS/DAY to now-7d/d', () => {
    const node: RangeNode = {
      type: 'range',
      field: 'event_date',
      lower: 'NOW-7DAYS/DAY',
      upper: 'NOW/DAY',
      lowerInclusive: true,
      upperInclusive: true,
    };

    expect(rangeRule(node, stubTransformChild)).toEqual(
      new Map([['range', new Map([['event_date', new Map([
        ['gte', 'now-7d/d'],
        ['lte', 'now/d'],
      ])]])]]),
    );
  });

  it('translates NOW+1MONTH with exclusive upper bound', () => {
    const node: RangeNode = {
      type: 'range',
      field: 'event_date',
      lower: 'NOW',
      upper: 'NOW+1MONTH',
      lowerInclusive: true,
      upperInclusive: false,
    };

    expect(rangeRule(node, stubTransformChild)).toEqual(
      new Map([['range', new Map([['event_date', new Map([
        ['gte', 'now'],
        ['lt',  'now+1M'],
      ])]])]]),
    );
  });

  it('translates ISO-anchored date math using || separator', () => {
    const node: RangeNode = {
      type: 'range',
      field: 'event_date',
      lower: '2024-01-01T00:00:00Z+1MONTH',
      upper: '2024-01-01T00:00:00Z+2MONTHS',
      lowerInclusive: true,
      upperInclusive: false,
    };

    expect(rangeRule(node, stubTransformChild)).toEqual(
      new Map([['range', new Map([['event_date', new Map([
        ['gte', '2024-01-01T00:00:00Z||+1M'],
        ['lt',  '2024-01-01T00:00:00Z||+2M'],
      ])]])]]),
    );
  });

  it('translates NOW/DAY rounding with open upper bound', () => {
    const node: RangeNode = {
      type: 'range',
      field: 'event_date',
      lower: 'NOW/DAY',
      upper: '*',
      lowerInclusive: true,
      upperInclusive: true,
    };

    expect(rangeRule(node, stubTransformChild)).toEqual(
      new Map([['range', new Map([['event_date', new Map([
        ['gte', 'now/d'],
      ])]])]]),
    );
  });

  it('does not translate numeric bounds', () => {
    const node: RangeNode = {
      type: 'range',
      field: 'price',
      lower: '10',
      upper: '100',
      lowerInclusive: true,
      upperInclusive: true,
    };

    expect(rangeRule(node, stubTransformChild)).toEqual(
      new Map([['range', new Map([['price', new Map([
        ['gte', '10'],
        ['lte', '100'],
      ])]])]]),
    );
  });
});
