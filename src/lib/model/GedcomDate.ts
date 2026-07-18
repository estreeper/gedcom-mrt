// A tolerant parser for GEDCOM DATE values.
//
// GEDCOM dates are free-form space-separated tokens, not a strict grammar
// (unlike Line.ts's LEVEL/XREF/TAG/VALUE shape), so this scans token-by-token
// rather than tokenizing characters. No compound regex is used, per repo
// convention — token classification is done with plain string checks.
//
// Handles: "12 JAN 1900", "JAN 1900", "1900", the approximation qualifiers
// ABT/EST/CAL/CALC/INT, the boundary qualifiers BEF/AFT, the range forms
// "BET x AND y" / "FROM x TO y", and the BC/BCE era markers (stored as a
// negative year, so the numeric comparisons below order them correctly
// without any BC-specific logic — 30 BCE is year -30, before 20 BCE's -20).
// Anything else is parsed as tolerantly as possible; a value with no
// recognizable year/month/day returns undefined.

export interface GedcomDate {
  year?: number;
  /** 1-12 */
  month?: number;
  day?: number;
  /** True when the value was qualified ABT/EST/CAL/CALC/INT — an estimate. */
  approximate?: boolean;
  /** The second endpoint of a BET…AND / FROM…TO range, if present. */
  rangeTo?: { year?: number; month?: number; day?: number };
}

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

const APPROXIMATE_QUALIFIERS = new Set(['ABT', 'EST', 'CAL', 'CALC', 'INT']);
const BC_MARKERS = new Set(['BC', 'BCE']);

function splitTokens(s: string): string[] {
  const tokens: string[] = [];
  let cur = '';
  for (const ch of s) {
    if (ch === ' ' || ch === '\t') {
      if (cur) {
        tokens.push(cur);
        cur = '';
      }
    } else {
      cur += ch;
    }
  }
  if (cur) tokens.push(cur);
  return tokens;
}

function isAllDigits(s: string): boolean {
  if (s.length === 0) return false;
  for (const ch of s) {
    if (ch < '0' || ch > '9') return false;
  }
  return true;
}

/** Strip a dual-dated year's "/NN" suffix (e.g. "1699/00" -> "1699"). */
function yearPart(tok: string): string {
  const slash = tok.indexOf('/');
  return slash >= 0 ? tok.slice(0, slash) : tok;
}

/** Split a token where a month abbreviation runs directly into a digit run
 *  with no space (e.g. "JAN1525" -> "JAN", "1525") so a missing space doesn't
 *  cause the whole token to be dropped. */
function splitGluedMonth(tok: string): string[] {
  for (const abbr of Object.keys(MONTHS)) {
    if (tok.length > abbr.length && tok.startsWith(abbr)) {
      const rest = tok.slice(abbr.length);
      if (isAllDigits(yearPart(rest))) return [abbr, rest];
    }
  }
  return [tok];
}

/** Parse the day/month/year out of a qualifier-free token run. Tolerant of
 *  unrecognized tokens (stray text) — they're simply ignored. Recognizes the
 *  BC/BCE era markers (negates the year) and a month glued directly to a
 *  digit run with no space. */
function parseDateCore(tokens: string[]): {
  year?: number;
  month?: number;
  day?: number;
} {
  const expanded = tokens.flatMap(splitGluedMonth);

  let month: number | undefined;
  let monthIndex = -1;
  let bc = false;
  const digitRuns: { value: string; index: number }[] = [];
  expanded.forEach((tok, i) => {
    if (BC_MARKERS.has(tok)) {
      bc = true;
      return;
    }
    const m = MONTHS[tok];
    if (m !== undefined) {
      month = m;
      monthIndex = i;
      return;
    }
    const yp = yearPart(tok);
    if (isAllDigits(yp)) digitRuns.push({ value: yp, index: i });
  });

  let day: number | undefined;
  let year: number | undefined;
  if (month === undefined) {
    // No month to anchor against: first digit run is the day, last is the
    // year (tolerates an extra stray digit run in between), matching GEDCOM's
    // DD MMM YYYY order.
    if (digitRuns.length === 1) {
      year = parseInt(digitRuns[0].value, 10);
    } else if (digitRuns.length >= 2) {
      day = parseInt(digitRuns[0].value, 10);
      year = parseInt(digitRuns[digitRuns.length - 1].value, 10);
    }
  } else {
    // A digit run before the month (e.g. "15 AUG") is the day, not the year
    // — a lone digit run with a month attached is otherwise indistinguishable
    // from "AUG 1900" (year, no day) without this positional check.
    const before = digitRuns.filter((d) => d.index < monthIndex);
    const after = digitRuns.filter((d) => d.index > monthIndex);
    if (before.length > 0) day = parseInt(before[0].value, 10);
    if (after.length > 0) year = parseInt(after[after.length - 1].value, 10);
  }
  if (day !== undefined && (day < 1 || day > 31)) day = undefined;
  if (year !== undefined && bc) year = -year;

  return { year, month, day };
}

/** Parse a raw GEDCOM DATE value. Returns undefined if no date is recoverable. */
export function parseGedcomDate(raw: string | undefined): GedcomDate | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  let tokens = splitTokens(trimmed.toUpperCase());
  if (tokens.length === 0) return undefined;

  let approximate = false;
  const first = tokens[0];

  if (APPROXIMATE_QUALIFIERS.has(first)) {
    approximate = true;
    tokens = tokens.slice(1);
  } else if (first === 'BEF' || first === 'AFT') {
    tokens = tokens.slice(1);
  } else if (first === 'BET') {
    const andIdx = tokens.indexOf('AND');
    if (andIdx > 0) {
      const from = parseDateCore(tokens.slice(1, andIdx));
      const to = parseDateCore(tokens.slice(andIdx + 1));
      if (from.year === undefined && from.month === undefined && from.day === undefined) {
        return undefined;
      }
      return { ...from, rangeTo: to };
    }
    tokens = tokens.slice(1);
  } else if (first === 'FROM') {
    const toIdx = tokens.indexOf('TO');
    if (toIdx > 0) {
      const from = parseDateCore(tokens.slice(1, toIdx));
      const to = parseDateCore(tokens.slice(toIdx + 1));
      if (from.year === undefined && from.month === undefined && from.day === undefined) {
        return undefined;
      }
      return { ...from, rangeTo: to };
    }
    tokens = tokens.slice(1);
  } else if (first === 'TO') {
    tokens = tokens.slice(1);
  }

  const core = parseDateCore(tokens);
  if (core.year === undefined && core.month === undefined && core.day === undefined) {
    return undefined;
  }
  return { ...core, approximate: approximate || undefined };
}

// --- comparison helpers ------------------------------------------------------
//
// Comparisons are conservative: a partial date (year only, or year+month) is
// treated as a RANGE spanning every day it could mean, and two dates are only
// considered definitively ordered when their ranges don't overlap. This avoids
// false positives from imprecise data (e.g. a birth recorded only as "1950"
// isn't flagged against a death in "MAR 1950" just because our arbitrary
// mid-year default would say otherwise).

function earliestKey(d: { year?: number; month?: number; day?: number }): number | undefined {
  if (d.year === undefined) return undefined;
  return d.year * 10000 + (d.month ?? 1) * 100 + (d.day ?? 1);
}

function latestKey(d: { year?: number; month?: number; day?: number }): number | undefined {
  if (d.year === undefined) return undefined;
  // Using 31 for an unknown day over-approximates some months, which only
  // ever makes the range wider (i.e. more conservative — fewer false flags).
  return d.year * 10000 + (d.month ?? 12) * 100 + (d.day ?? 31);
}

/** True only when every possible reading of `a` is before every possible
 *  reading of `b` — i.e. the orderings can't be explained by date imprecision. */
export function isDefinitelyBefore(a: GedcomDate | undefined, b: GedcomDate | undefined): boolean {
  const aLatest = a && latestKey(a);
  const bEarliest = b && earliestKey(b);
  if (aLatest === undefined || bEarliest === undefined) return false;
  return aLatest < bEarliest;
}

/** True only when every possible reading of `a` is after every possible
 *  reading of `b`. */
export function isDefinitelyAfter(a: GedcomDate | undefined, b: GedcomDate | undefined): boolean {
  const aEarliest = a && earliestKey(a);
  const bLatest = b && latestKey(b);
  if (aEarliest === undefined || bLatest === undefined) return false;
  return aEarliest > bLatest;
}

/** True when `d`'s earliest possible reading is still after `today`
 *  (year/month/day, no qualifiers). Used for future-date checks. */
export function isDefinitelyAfterToday(
  d: GedcomDate | undefined,
  today: { year: number; month: number; day: number }
): boolean {
  const aEarliest = d && earliestKey(d);
  if (aEarliest === undefined) return false;
  const todayKey = today.year * 10000 + today.month * 100 + today.day;
  return aEarliest > todayKey;
}

/** Whole years between two dates' best-guess (mid-range) reading, or undefined
 *  if either year is unknown. Used for heuristic (non-guaranteed) checks like
 *  age at marriage/lifespan, where a rough estimate is the point. */
export function approxYearsBetween(
  a: GedcomDate | undefined,
  b: GedcomDate | undefined
): number | undefined {
  if (!a || !b || a.year === undefined || b.year === undefined) return undefined;
  const aMonth = a.month ?? 6;
  const bMonth = b.month ?? 6;
  let years = b.year - a.year;
  if (bMonth < aMonth) years -= 1;
  return years;
}
