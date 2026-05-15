import { JavaMap } from '../context';

// region Solr date math gap detection and conversion

/**
 * Solr date-math unit → OpenSearch interval suffix.
 *
 * Note: OpenSearch uses lowercase for all units except 'M' (month) to
 * distinguish it from 'm' (minute).
 */
const SOLR_UNIT_TO_OS: Record<string, string> = {
  YEAR: 'y',
  YEARS: 'y',
  MONTH: 'M',
  MONTHS: 'M',
  DAY: 'd',
  DAYS: 'd',
  HOUR: 'h',
  HOURS: 'h',
  MINUTE: 'm',
  MINUTES: 'm',
  SECOND: 's',
  SECONDS: 's',
};

/**
 * Units whose length varies with the calendar and therefore **cannot** be
 * expressed as a fixed duration when the count is greater than 1.
 *
 * When the count is 1 we use `calendar_interval`; when > 1 we approximate
 * with a `fixed_interval` and emit a warning.
 */
const CALENDAR_ONLY_UNITS = new Set(['YEAR', 'YEARS', 'MONTH', 'MONTHS', 'DAY', 'DAYS']);

/** Approximate number of seconds in one calendar unit (used for fixed-interval fallback). */
const APPROX_SECONDS: Record<string, number> = {
  YEAR: 31536000,   // 365 × 24 × 3600
  YEARS: 31536000,
  MONTH: 2592000,   // 30 × 24 × 3600
  MONTHS: 2592000,
  DAY: 86400,       // 24 × 3600
  DAYS: 86400,
};

/** Matches a single date-math component like "+1MONTH" or "+2DAYS".
 *  Plural forms listed first so the regex engine doesn't short-circuit on the singular. */
const SOLR_DATE_COMPONENT_RE = /\+(\d+)(YEARS|YEAR|MONTHS|MONTH|DAYS|DAY|HOURS|HOUR|MINUTES|MINUTE|SECONDS|SECOND)/gi;

/** Matches the entire gap string — one or more components with nothing else. */
const SOLR_DATE_GAP_SINGLE_RE = /^\+(\d+)(YEAR|YEARS|MONTH|MONTHS|DAY|DAYS|HOUR|HOURS|MINUTE|MINUTES|SECOND|SECONDS)$/i;

/**
 * Return `true` if `gap` looks like a Solr date-math gap string.
 *
 * Supports both simple gaps ("+1MONTH") and compound gaps ("+1MONTH+2DAYS").
 */
export function isSolrDateMathGap(gap: string): boolean {
  // Build the full string from all matched components; if it equals the
  // original then the entire string is valid date math.
  const matches = gap.match(SOLR_DATE_COMPONENT_RE);
  if (!matches) return false;
  return matches.join('') === gap;
}

/** Result of converting a Solr date gap to an OpenSearch interval parameter. */
export interface DateGapInterval {
  /** The OpenSearch date-histogram parameter name to use. */
  type: 'calendar_interval' | 'fixed_interval';
  /** The interval value (e.g. "1M", "5m", "720h"). */
  value: string;
  /** Set when a calendar unit was approximated as a fixed interval. */
  approximation?: 'single' | 'compound';
}

/** Exact number of seconds in one fixed-duration Solr date math unit. */
const EXACT_SECONDS: Record<string, number> = {
  HOUR: 3600,
  HOURS: 3600,
  MINUTE: 60,
  MINUTES: 60,
  SECOND: 1,
  SECONDS: 1,
};

/**
 * Convert a total number of seconds to the most natural OpenSearch
 * fixed_interval string: prefer hours if evenly divisible, then minutes,
 * then seconds.
 */
function secondsToFixedInterval(totalSeconds: number): string {
  if (totalSeconds % 3600 === 0) {
    return `${totalSeconds / 3600}h`;
  }
  if (totalSeconds % 60 === 0) {
    return `${totalSeconds / 60}m`;
  }
  return `${totalSeconds}s`;
}

/**
 * Convert a Solr date-math gap string to an OpenSearch date-histogram
 * interval specification.
 *
 * Supports simple gaps ("+1MONTH") and compound gaps ("+1MONTH+2DAYS").
 *
 * Rules for **simple** (single-component) gaps:
 *   • count = 1 for any unit → `calendar_interval` (e.g. "1M", "1d")
 *   • count > 1 for fixed-duration units (h/m/s) → `fixed_interval`
 *   • count > 1 for calendar units (y/M/d) → `fixed_interval` with an
 *     approximation (30 d/month, 365 d/year, 24 h/day) and a console warning
 *
 * **Compound** gaps are always converted to `fixed_interval` by summing
 * all components into total seconds, with calendar units approximated.
 *
 * @throws Error if the gap string does not match the expected pattern.
 */
export function convertSolrDateGap(gap: string): DateGapInterval {
  // Try simple (single-component) path first for the common case
  const singleMatch = SOLR_DATE_GAP_SINGLE_RE.exec(gap);
  if (singleMatch) {
    return convertSimpleDateGap(gap, Number(singleMatch[1]), singleMatch[2].toUpperCase());
  }

  // Try compound path
  return convertCompoundDateGap(gap);
}

/** Handle a single-component gap like "+1MONTH" or "+5MINUTES". */
function convertSimpleDateGap(gap: string, count: number, solrUnit: string): DateGapInterval {
  const osUnit = SOLR_UNIT_TO_OS[solrUnit];
  if (!osUnit) {
    throw new Error(`Unknown Solr date unit: "${solrUnit}"`);
  }

  // Single-unit → always calendar_interval
  if (count === 1) {
    return { type: 'calendar_interval', value: `1${osUnit}` };
  }

  // Multi-count, fixed-duration (h/m/s) → fixed_interval directly
  if (!CALENDAR_ONLY_UNITS.has(solrUnit)) {
    return { type: 'fixed_interval', value: `${count}${osUnit}` };
  }

  // Multi-count, calendar unit (y/M/d) → approximate as fixed duration
  const totalSeconds = count * APPROX_SECONDS[solrUnit];
  const value = secondsToFixedInterval(totalSeconds);
  console.warn(
    `[solr-date-gap] Solr gap "${gap}" approximated as fixed_interval "${value}" — bucket boundaries may not align with calendar ${solrUnit.toLowerCase()} boundaries.`,
  );
  return { type: 'fixed_interval', value, approximation: 'single' };
}

/**
 * Handle a compound gap like "+1MONTH+2DAYS" or "+1YEAR+6MONTHS".
 *
 * All components are summed into total seconds. Calendar units are
 * approximated. A warning is always emitted because compound gaps
 * cannot be represented as a single calendar_interval.
 */
function convertCompoundDateGap(gap: string): DateGapInterval {
  // Use a fresh regex instance to avoid lastIndex issues with the global flag
  // Plural forms listed first so the regex engine doesn't short-circuit on the singular
  const re = /\+(\d+)(YEARS|YEAR|MONTHS|MONTH|DAYS|DAY|HOURS|HOUR|MINUTES|MINUTE|SECONDS|SECOND)/gi;
  const components: Array<{ count: number; unit: string }> = [];
  let reconstructed = '';
  let m: RegExpExecArray | null;

  while ((m = re.exec(gap)) !== null) {
    components.push({ count: Number(m[1]), unit: m[2].toUpperCase() });
    reconstructed += m[0];
  }

  if (components.length === 0 || reconstructed !== gap) {
    throw new Error(`Unrecognised Solr date gap: "${gap}"`);
  }

  // Sum all components into total seconds
  let totalSeconds = 0;
  for (const { count, unit } of components) {
    const approx = APPROX_SECONDS[unit];
    if (approx == null) {
      const exact = EXACT_SECONDS[unit];
      if (exact == null) {
        throw new Error(`Unknown Solr date unit in compound gap: "${unit}"`);
      } else {
        totalSeconds += count * exact;
      }
    } else {
      totalSeconds += count * approx;
    }
  }

  const value = secondsToFixedInterval(totalSeconds);

  console.warn(
    `[solr-date-gap] Compound Solr gap "${gap}" approximated as fixed_interval "${value}" — bucket boundaries may not align with calendar boundaries.`,
  );
  return { type: 'fixed_interval', value, approximation: 'compound' };
}

// endregion

// region Solr date math bound conversion

/**
 * Full Solr date-math unit → OpenSearch suffix map for range bound expressions.
 *
 * Extends the gap map with units that are valid in date math bounds but not
 * used in histogram gaps:
 *   DATE         — Solr alias for DAY → 'd'
 *   MILLI/MILLIS/MILLISECOND/MILLISECONDS → 'ms'
 *
 * Source: https://solr.apache.org/guide/solr/latest/indexing-guide/date-formatting-math.html
 */
const BOUND_UNIT_TO_OS: Record<string, string> = {
  ...SOLR_UNIT_TO_OS,
  DATE:         'd',   // Solr alias for DAY
  MILLI:        'ms',
  MILLIS:       'ms',
  MILLISECOND:  'ms',
  MILLISECONDS: 'ms',
};

/**
 * Regex for detecting date-math operators in range bound expressions.
 *
 * NOT global — avoids the lastIndex state bug that affects `.test()` with
 * module-level global regex constants.
 *
 * Matches segments like "+1DAY", "-7MONTHS", "/HOUR", "+500MILLIS", "/DATE".
 * Longer aliases listed first to prevent partial matching (e.g. MILLISECONDS
 * before MILLIS before MILLI).
 */
const SOLR_DATE_MATH_BOUND_RE =
  /[-+/]\d*(MILLISECONDS|MILLISECOND|MILLIS|MILLI|YEARS?|MONTHS?|DAYS?|DATE|HOURS?|MINUTES?|SECONDS?)/i;

/**
 * Return `true` when `bound` contains Solr date-math syntax.
 *
 * Recognises:
 *   - `NOW` (bare, with or without trailing operators)
 *   - ISO date strings with date-math suffixes: `2024-01-01T00:00:00Z+1MONTH`
 */
export function isSolrDateMathBound(bound: string): boolean {
  if (bound === '*') return false;
  return /^NOW\b/i.test(bound) || SOLR_DATE_MATH_BOUND_RE.test(bound);
}

/**
 * Convert a Solr date-math bound expression to its OpenSearch equivalent.
 *
 * Full unit support per the Solr spec:
 *   YEAR/YEARS, MONTH/MONTHS, DAY/DAYS, DATE (=DAY),
 *   HOUR/HOURS, MINUTE/MINUTES, SECOND/SECONDS,
 *   MILLI/MILLIS/MILLISECOND/MILLISECONDS
 *
 * Translation rules:
 *   NOW                          → now
 *   NOW/DAY                      → now/d
 *   NOW-7DAYS                    → now-7d
 *   NOW+1MONTH/DAY               → now+1M/d
 *   NOW+500MILLIS                → now+500ms
 *   NOW-1DATE                    → now-1d           (DATE alias)
 *   NOW+6MONTHS+3DAYS/DAY        → now+6M+3d/d
 *   2024-01-01T00:00:00Z         → passed through unchanged (plain ISO)
 *   2024-01-01T00:00:00Z+1MONTH  → 2024-01-01T00:00:00Z||+1M
 *   1972-05-20T17:33:18.772Z+6MONTHS+3DAYS/DAY → 1972-05-20T17:33:18.772Z||+6M+3d/d
 *
 * OpenSearch anchored date math requires `||` to separate an ISO anchor from
 * the math operators. NOW-based expressions attach operators directly.
 *
 * @throws Error if a unit in the expression is not recognised.
 */
export function convertSolrDateMathBound(bound: string): string {
  if (bound === '*') return bound;

  // Fast path: plain ISO date string with no date-math — pass through as-is
  if (/^\d{4}-\d{2}-\d{2}(T[\d:Z.+-]+)?$/.test(bound)) {
    return bound;
  }

  const nowMatch = /^NOW\b/i.exec(bound);
  const isoAnchorMatch = /^(\d{4}-\d{2}-\d{2}(?:T[^+\-/]*)?)([+\-/].+)$/.exec(bound);

  let anchor: string;
  let mathTail: string;

  if (nowMatch) {
    anchor = 'now';
    mathTail = bound.slice(nowMatch[0].length);
  } else if (isoAnchorMatch) {
    anchor = isoAnchorMatch[1];   // e.g. "2024-01-01T00:00:00Z"
    mathTail = isoAnchorMatch[2]; // e.g. "+1MONTH"
  } else {
    // Plain non-date-math value (numeric, string keyword) — return unchanged
    return bound;
  }

  if (!mathTail) {
    // Bare NOW with no operators
    return anchor;
  }

  // Translate each operator segment in the tail.
  // Longer unit names listed first to prevent partial matching.
  const translatedTail = mathTail.replace(
    /([-+/])(\d+)?(MILLISECONDS|MILLISECOND|MILLIS|MILLI|YEARS?|MONTHS?|DAYS?|DATE|HOURS?|MINUTES?|SECONDS?)/gi,
    (_match, op: string, countStr: string | undefined, unit: string) => {
      const osUnit = BOUND_UNIT_TO_OS[unit.toUpperCase()];
      if (!osUnit) {
        throw new Error(`Unknown Solr date unit in bound expression: "${unit}"`);
      }
      // Rounding has no count: /DAY → /d; arithmetic has count: +7DAYS → +7d
      return countStr !== undefined ? `${op}${countStr}${osUnit}` : `${op}${osUnit}`;
    },
  );

  // NOW-based: math operators attach directly (e.g. now-7d/d)
  // ISO-anchored: OpenSearch requires || separator (e.g. 2024-01-01T00:00:00Z||+1M)
  return nowMatch ? `${anchor}${translatedTail}` : `${anchor}||${translatedTail}`;
}

// endregion

const SORT_KEY_MAP: Record<string, string> = {
  count: '_count',
  index: '_key',
};

/**
 * Convert a Solr sort specification to an OpenSearch order map.
 *
 * Accepts either:
 *   - A string like "count desc" or "index asc"
 *   - A Map like {count: "desc"}
 *
 * Translates Solr sort keys (count, index) to their OpenSearch equivalents (_count, _key).
 */
export function convertSort(sortSpec: string | JavaMap): JavaMap {
  const order = new Map<string, any>();

  if (typeof sortSpec === 'string') {
    const parts = sortSpec.trim().split(/\s+/);
    const key = parts[0];
    const direction = parts[1] || 'desc';
    const osKey = SORT_KEY_MAP[key] || key;
    order.set(osKey, direction.toLowerCase());
  } else if (isMapLike(sortSpec)) {
    for (const key of sortSpec.keys()) {
      const direction = (sortSpec.get(key) || 'desc').toString().toLowerCase();
      const osKey = SORT_KEY_MAP[key] || key;
      order.set(osKey, direction);
    }
  }

  return order;
}

/** Check if a value looks like a JavaMap / Map (has .get and .keys methods). */
export function isMapLike(v: any): v is JavaMap {
  return (
    v != null &&
    typeof v === 'object' &&
    typeof v.get === 'function' &&
    typeof v.keys === 'function'
  );
}
