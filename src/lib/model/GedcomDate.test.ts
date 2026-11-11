import {
  parseGedcomDate,
  isDefinitelyBefore,
  isDefinitelyAfter,
  isDefinitelyAfterToday,
  approxYearsBetween,
} from './GedcomDate';

describe('parseGedcomDate', () => {
  it('parses a full DD MMM YYYY date', () => {
    expect(parseGedcomDate('12 JAN 1900')).toEqual({ year: 1900, month: 1, day: 12 });
  });

  it('parses a MMM YYYY date', () => {
    expect(parseGedcomDate('MAR 1950')).toEqual({ year: 1950, month: 3 });
  });

  it('parses a bare year', () => {
    expect(parseGedcomDate('1950')).toEqual({ year: 1950 });
  });

  it('is case-insensitive', () => {
    expect(parseGedcomDate('12 jan 1900')).toEqual({ year: 1900, month: 1, day: 12 });
  });

  it('parses the ABT/EST/CAL approximation qualifiers', () => {
    expect(parseGedcomDate('ABT 1900')).toEqual({ year: 1900, approximate: true });
    expect(parseGedcomDate('EST 1900')).toEqual({ year: 1900, approximate: true });
    expect(parseGedcomDate('CAL 1900')).toEqual({ year: 1900, approximate: true });
  });

  it('parses BEF/AFT as a one-sided bound on the date', () => {
    expect(parseGedcomDate('BEF 1900')).toEqual({ year: 1900, bound: 'before' });
    expect(parseGedcomDate('AFT 1900')).toEqual({ year: 1900, bound: 'after' });
  });

  it('parses open-ended TO / FROM periods as one-sided bounds', () => {
    expect(parseGedcomDate('TO 1900')).toEqual({ year: 1900, bound: 'before' });
    expect(parseGedcomDate('FROM 1900')).toEqual({ year: 1900, bound: 'after' });
  });

  it('falls back to the bare date for a BET with no AND', () => {
    expect(parseGedcomDate('BET 1900')).toEqual({ year: 1900 });
  });

  it('returns undefined for a range with no usable start', () => {
    expect(parseGedcomDate('BET UNKNOWN AND 1900')).toBeUndefined();
    expect(parseGedcomDate('FROM UNKNOWN TO 1900')).toBeUndefined();
    expect(parseGedcomDate('ABT')).toBeUndefined();
    expect(parseGedcomDate('   ')).toBeUndefined();
  });

  it('ignores an out-of-range day and stray digit runs', () => {
    expect(parseGedcomDate('45 JAN 1900')).toEqual({ year: 1900, month: 1 });
    expect(parseGedcomDate('12 5 1900')).toEqual({ year: 1900, day: 12 });
  });

  it('parses a BET x AND y range', () => {
    expect(parseGedcomDate('BET 1900 AND 1905')).toEqual({
      year: 1900,
      rangeTo: { year: 1905 },
    });
  });

  it('parses a FROM x TO y range', () => {
    expect(parseGedcomDate('FROM 1900 TO 1905')).toEqual({
      year: 1900,
      rangeTo: { year: 1905 },
    });
  });

  it('handles a dual-dated year (1699/00) by using the first year', () => {
    expect(parseGedcomDate('1699/00')).toEqual({ year: 1699 });
  });

  it('tolerates unrecognized tokens without throwing', () => {
    expect(parseGedcomDate('SOMEWHERE IN THE PAST')).toBeUndefined();
  });

  it('returns undefined for empty/undefined input', () => {
    expect(parseGedcomDate('')).toBeUndefined();
    expect(parseGedcomDate(undefined)).toBeUndefined();
    expect(parseGedcomDate('   ')).toBeUndefined();
  });

  it('parses a DD MMM date with no year as a day, not a year', () => {
    expect(parseGedcomDate('15 AUG')).toEqual({ year: undefined, month: 8, day: 15 });
  });

  it('parses a month glued to the year with no space', () => {
    expect(parseGedcomDate('29 Jan1525')).toEqual({ year: 1525, month: 1, day: 29 });
  });

  it('parses BC/BCE as a negative year', () => {
    expect(parseGedcomDate('20 BCE')).toEqual({ year: -20 });
    expect(parseGedcomDate('30 BC')).toEqual({ year: -30 });
    expect(parseGedcomDate('12 JAN 44 BC')).toEqual({ year: -44, month: 1, day: 12 });
  });
});

describe('isDefinitelyBefore / isDefinitelyAfter', () => {
  it('is true for two fully-specified dates in the expected order', () => {
    const a = parseGedcomDate('1 JAN 1900');
    const b = parseGedcomDate('1 JAN 1950');
    expect(isDefinitelyBefore(a, b)).toBe(true);
    expect(isDefinitelyAfter(b, a)).toBe(true);
    expect(isDefinitelyBefore(b, a)).toBe(false);
  });

  it('is false when partial-date ranges overlap (ambiguous)', () => {
    // Birth known only as "1950"; death in March 1950 — birth could plausibly
    // have happened in Jan/Feb 1950, so this must NOT be flagged as impossible.
    const birth = parseGedcomDate('1950');
    const death = parseGedcomDate('MAR 1950');
    expect(isDefinitelyAfter(birth, death)).toBe(false);
  });

  it('is true when partial-date ranges cannot overlap', () => {
    // Birth in December 1900 cannot be after a death in January 1900.
    const birth = parseGedcomDate('DEC 1900');
    const death = parseGedcomDate('JAN 1900');
    expect(isDefinitelyAfter(birth, death)).toBe(true);
  });

  it('is false when either date is missing', () => {
    expect(isDefinitelyBefore(undefined, parseGedcomDate('1900'))).toBe(false);
    expect(isDefinitelyBefore(parseGedcomDate('1900'), undefined)).toBe(false);
  });

  it('orders BC dates chronologically (a larger BC year is earlier)', () => {
    const thirtyBce = parseGedcomDate('30 BCE');
    const twentyBce = parseGedcomDate('20 BCE');
    expect(isDefinitelyBefore(thirtyBce, twentyBce)).toBe(true);
    expect(isDefinitelyAfter(twentyBce, thirtyBce)).toBe(true);
  });
});

describe('isDefinitelyAfterToday', () => {
  const today = { year: 2026, month: 7, day: 17 };

  it('flags a year clearly in the future', () => {
    expect(isDefinitelyAfterToday(parseGedcomDate('2030'), today)).toBe(true);
  });

  it('does not flag the current year alone (could already have happened)', () => {
    expect(isDefinitelyAfterToday(parseGedcomDate('2026'), today)).toBe(false);
  });

  it('flags a specific future date this year', () => {
    expect(isDefinitelyAfterToday(parseGedcomDate('25 DEC 2026'), today)).toBe(true);
  });

  it('does not flag a past date', () => {
    expect(isDefinitelyAfterToday(parseGedcomDate('1 JAN 2000'), today)).toBe(false);
  });
});

describe('approxYearsBetween', () => {
  it('computes whole years between two dates', () => {
    const a = parseGedcomDate('1 JAN 1900');
    const b = parseGedcomDate('1 JAN 1950');
    expect(approxYearsBetween(a, b)).toBe(50);
  });

  it('returns undefined when a year is unknown', () => {
    expect(approxYearsBetween(undefined, parseGedcomDate('1950'))).toBeUndefined();
  });

  it('does not compute an age when the birth year is unknown ("15 AUG")', () => {
    const birth = parseGedcomDate('15 AUG');
    const death = parseGedcomDate('25 DEC 1959');
    expect(approxYearsBetween(birth, death)).toBeUndefined();
  });

  it('handles a glued month+year birth date correctly', () => {
    const birth = parseGedcomDate('29 Jan1525');
    const death = parseGedcomDate('AFT 1552');
    expect(approxYearsBetween(birth, death)).toBe(27);
  });
});

describe('comparisons with one-sided bounds and ranges', () => {
  const d = parseGedcomDate;

  it('never treats a BEF date as definitely after anything', () => {
    // "BEF 1900" could be 1700, so it is not definitely after 1850...
    expect(isDefinitelyAfter(d('BEF 1900'), d('1850'))).toBe(false);
    // ...but it IS definitely before anything later than its bound.
    expect(isDefinitelyBefore(d('BEF 1900'), d('1950'))).toBe(true);
    expect(isDefinitelyAfter(d('1950'), d('BEF 1900'))).toBe(true);
  });

  it('never treats an AFT date as definitely before anything', () => {
    expect(isDefinitelyBefore(d('AFT 1850'), d('1900'))).toBe(false);
    expect(isDefinitelyAfter(d('AFT 1900'), d('1850'))).toBe(true);
    expect(isDefinitelyBefore(d('1850'), d('AFT 1900'))).toBe(true);
  });

  it('uses the end of a BET…AND range as its latest reading', () => {
    expect(isDefinitelyBefore(d('BET 1900 AND 1950'), d('1920'))).toBe(false);
    expect(isDefinitelyBefore(d('BET 1900 AND 1950'), d('1951'))).toBe(true);
    expect(isDefinitelyAfter(d('1920'), d('BET 1900 AND 1950'))).toBe(false);
    expect(isDefinitelyAfter(d('BET 1900 AND 1950'), d('1899'))).toBe(true);
  });

  it('treats a range with an unreadable end as open-ended', () => {
    expect(isDefinitelyBefore(d('BET 1900 AND SOMETIME'), d('2000'))).toBe(false);
  });

  it('does not call a BEF date in a future year a future date', () => {
    const today = { year: 2026, month: 1, day: 1 };
    expect(isDefinitelyAfterToday(d('BEF 2090'), today)).toBe(false);
    expect(isDefinitelyAfterToday(d('AFT 2090'), today)).toBe(true);
  });
});
