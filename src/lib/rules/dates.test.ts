import { parseText } from '../Parser';
import { dateRules } from './dates';
import {
  CLEAN,
  DEATH_BEFORE_BIRTH,
  FUTURE_BIRTH,
  UNREALISTIC_LIFESPAN,
  MARRIAGE_BEFORE_BIRTH,
  MARRIAGE_AFTER_DEATH,
  PARENT_BORN_AFTER_CHILD,
  BURIAL_BEFORE_DEATH,
} from '../__fixtures__';

const NOW = new Date('2026-07-17T00:00:00Z');

describe('dateRules', () => {
  it('finds no issues in a clean file', () => {
    expect(dateRules(parseText(CLEAN), { now: NOW })).toEqual([]);
  });

  it('detects a death date before a birth date', () => {
    const issues = dateRules(parseText(DEATH_BEFORE_BIRTH), { now: NOW });
    expect(issues).toHaveLength(1);
    expect(issues[0].category).toBe('DEATH_BEFORE_BIRTH');
    expect(issues[0].severity).toBe('error');
    expect(issues[0].suggestedFixes).toEqual([]);
    expect(issues[0].quickEdit).toHaveLength(2);
    expect(issues[0].humanMessage).toContain('John /Smith/');
  });

  it('detects a birth date in the future', () => {
    const issues = dateRules(parseText(FUTURE_BIRTH), { now: NOW });
    expect(issues).toHaveLength(1);
    expect(issues[0].category).toBe('FUTURE_DATE');
    expect(issues[0].severity).toBe('error');
  });

  it('does not flag a future date relative to an earlier "now"', () => {
    const issues = dateRules(parseText(FUTURE_BIRTH), {
      now: new Date('2999-06-01T00:00:00Z'),
    });
    expect(issues).toEqual([]);
  });

  it('detects an unrealistic lifespan (>123 years)', () => {
    const issues = dateRules(parseText(UNREALISTIC_LIFESPAN), { now: NOW });
    expect(issues.some((i) => i.category === 'UNREALISTIC_LIFESPAN')).toBe(true);
  });

  it('detects a marriage date before a spouse\'s birth date', () => {
    const issues = dateRules(parseText(MARRIAGE_BEFORE_BIRTH), { now: NOW });
    expect(issues.some((i) => i.category === 'MARRIAGE_BEFORE_BIRTH')).toBe(true);
  });

  it('detects a marriage date after a spouse\'s death date', () => {
    const issues = dateRules(parseText(MARRIAGE_AFTER_DEATH), { now: NOW });
    expect(issues.some((i) => i.category === 'MARRIAGE_AFTER_DEATH')).toBe(true);
  });

  it('detects a parent born after their child', () => {
    const issues = dateRules(parseText(PARENT_BORN_AFTER_CHILD), { now: NOW });
    expect(issues.some((i) => i.category === 'PARENT_BORN_AFTER_CHILD')).toBe(true);
  });

  it('detects a burial date before a death date', () => {
    const issues = dateRules(parseText(BURIAL_BEFORE_DEATH), { now: NOW });
    expect(issues.some((i) => i.category === 'EVENT_ORDER_IMPOSSIBLE')).toBe(true);
  });

  it('downgrades to warning when an involved date is approximate', () => {
    const approx = `0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME John /Smith/
1 BIRT
2 DATE ABT 1950
1 DEAT
2 DATE 1 JAN 1900
0 TRLR
`;
    const issues = dateRules(parseText(approx), { now: NOW });
    expect(issues).toHaveLength(1);
    expect(issues[0].category).toBe('DEATH_BEFORE_BIRTH');
    expect(issues[0].severity).toBe('warning');
  });

  it('does not flag ambiguous partial dates that could plausibly not overlap', () => {
    const ambiguous = `0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME John /Smith/
1 BIRT
2 DATE 1950
1 DEAT
2 DATE MAR 1950
0 TRLR
`;
    expect(dateRules(parseText(ambiguous), { now: NOW })).toEqual([]);
  });
});
