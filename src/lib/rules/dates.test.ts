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

  // One-sided and ranged dates: the 'error' tier must only fire when no
  // reading of the dates could be consistent.
  const person = (birth: string, death: string, extra = '') =>
    `0 HEAD\n0 @I1@ INDI\n1 NAME John /Smith/\n1 BIRT\n2 DATE ${birth}\n1 DEAT\n2 DATE ${death}\n${extra}0 TRLR\n`;
  const categories = (text: string) =>
    dateRules(parseText(text), { now: NOW }).map((i) => i.category);

  it.each([
    ['BEF 1900', '1850'], // born any time before 1900 — 1840 is fine
    ['1900', 'AFT 1850'], // died any time after 1850 — 1950 is fine
    ['BET 1800 AND 1900', '1850'],
    ['1900', 'BET 1850 AND 1950'],
  ])('does not flag birth %s / death %s as death-before-birth', (birth, death) => {
    expect(categories(person(birth, death))).not.toContain('DEATH_BEFORE_BIRTH');
  });

  it.each([
    ['AFT 1900', '1850'],
    ['1900', 'BEF 1850'],
    ['BET 1900 AND 1910', 'BET 1850 AND 1860'],
  ])('still flags birth %s / death %s as death-before-birth', (birth, death) => {
    expect(categories(person(birth, death))).toContain('DEATH_BEFORE_BIRTH');
  });

  it('only flags a lifespan when the dates bound it from below', () => {
    expect(categories(person('1800', '1930'))).toContain('UNREALISTIC_LIFESPAN');
    expect(categories(person('BEF 1800', '1930'))).toContain('UNREALISTIC_LIFESPAN');
    expect(categories(person('1800', 'AFT 1930'))).toContain('UNREALISTIC_LIFESPAN');
    expect(categories(person('AFT 1800', '1930'))).not.toContain('UNREALISTIC_LIFESPAN');
    expect(categories(person('1800', 'BEF 1930'))).not.toContain('UNREALISTIC_LIFESPAN');
    expect(categories(person('BET 1800 AND 1850', '1930'))).not.toContain('UNREALISTIC_LIFESPAN');
  });

  it('detects a future death date and a future marriage date', () => {
    expect(categories(person('1900', '2999'))).toContain('FUTURE_DATE');
    const fam = `0 HEAD\n0 @F1@ FAM\n1 MARR\n2 DATE 1 JAN 2999\n0 TRLR\n`;
    const issues = dateRules(parseText(fam), { now: NOW });
    expect(issues.map((i) => i.id)).toEqual(['FUTURE_DATE:F1:MARR']);
    expect(issues[0].quickEdit).toEqual([
      { recordId: 'F1', path: [0, 0], label: 'Marriage date', value: '1 JAN 2999', allowClear: true },
    ]);
  });

  it('detects a baptism or christening before birth and a cremation before death', () => {
    const text = person('1 JAN 1900', '1 JAN 1980', '1 BAPM\n2 DATE 1899\n1 CHR\n2 DATE 1898\n1 CREM\n2 DATE 1970\n');
    const issues = dateRules(parseText(text), { now: NOW });
    expect(issues.map((i) => i.id)).toEqual([
      'EVENT_ORDER_IMPOSSIBLE:I1:BAPM',
      'EVENT_ORDER_IMPOSSIBLE:I1:CHR',
      'EVENT_ORDER_IMPOSSIBLE:I1:CREM',
    ]);
    expect(issues[2].humanMessage).toContain('cremation is recorded before their death');
  });

  it('writes xrefs consistently in the parent-born-after-child message', () => {
    const issue = dateRules(parseText(PARENT_BORN_AFTER_CHILD), { now: NOW }).find(
      (i) => i.category === 'PARENT_BORN_AFTER_CHILD'
    )!;
    const [parentId, childId] = issue.recordIds;
    expect(issue.message).toBe(
      `@${parentId}@ is recorded as @${childId}@'s parent but was born after @${childId}@.`
    );
  });

  it('skips events whose dates cannot be parsed, and records with no id', () => {
    expect(categories(person('unknown', 'sometime'))).toEqual([]);
    expect(categories('0 HEAD\n0 INDI\n1 BIRT\n2 DATE 2999\n0 TRLR\n')).toEqual([]);
  });
});
