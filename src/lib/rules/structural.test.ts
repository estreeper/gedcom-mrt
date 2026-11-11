import { parseText } from '../Parser';
import { structuralRules } from './structural';
import {
  CLEAN,
  SELF_PARENT,
  CIRCULAR_ANCESTRY,
  DUPLICATE_INDIVIDUAL,
  ORPHAN_INDIVIDUAL,
} from '../__fixtures__';

describe('structuralRules', () => {
  it('finds no issues in a clean file', () => {
    expect(structuralRules(parseText(CLEAN))).toEqual([]);
  });

  it('detects an individual listed as their own parent', () => {
    const issues = structuralRules(parseText(SELF_PARENT));
    expect(issues.some((i) => i.category === 'SELF_REFERENTIAL_RELATION')).toBe(true);
    // Must not also double-count as a circular-ancestry chain.
    expect(issues.some((i) => i.category === 'CIRCULAR_ANCESTRY')).toBe(false);
  });

  it('detects a multi-hop circular ancestry', () => {
    const issues = structuralRules(parseText(CIRCULAR_ANCESTRY));
    const cycle = issues.find((i) => i.category === 'CIRCULAR_ANCESTRY');
    expect(cycle).toBeDefined();
    expect(cycle!.severity).toBe('error');
    expect(cycle!.recordIds.length).toBeGreaterThan(1);
  });

  it('detects likely-duplicate individuals (same name + birth year)', () => {
    const issues = structuralRules(parseText(DUPLICATE_INDIVIDUAL));
    expect(issues.some((i) => i.category === 'DUPLICATE_INDIVIDUAL')).toBe(true);
  });

  it('does not flag two same-named people with different birth years', () => {
    const differentYears = `0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME John /Smith/
1 BIRT
2 DATE 1 JAN 1900
0 @I2@ INDI
1 NAME John /Smith/
1 BIRT
2 DATE 1 JAN 1950
0 TRLR
`;
    const issues = structuralRules(parseText(differentYears));
    expect(issues.some((i) => i.category === 'DUPLICATE_INDIVIDUAL')).toBe(false);
  });

  it('detects an individual not linked to any family', () => {
    const issues = structuralRules(parseText(ORPHAN_INDIVIDUAL));
    expect(issues.some((i) => i.category === 'ORPHAN_INDI')).toBe(true);
  });

  const ids = (text: string) => structuralRules(parseText(text)).map((i) => i.id);

  it('detects one person listed as both spouses of a family', () => {
    const text = '0 HEAD\n0 @I1@ INDI\n1 NAME Pat /Lee/\n1 FAMS @F1@\n0 @F1@ FAM\n1 HUSB @I1@\n1 WIFE @I1@\n0 TRLR\n';
    const issues = structuralRules(parseText(text));
    expect(issues.map((i) => i.id)).toEqual(['SELF_REFERENTIAL_RELATION:F1:SPOUSE']);
    expect(issues[0].severity).toBe('error');
  });

  it('reports a cycle once, with a stable id regardless of where the walk starts', () => {
    const cycle = (order: string[]) => {
      const indi: Record<string, string> = {
        I1: '0 @I1@ INDI\n1 FAMC @F2@\n1 FAMS @F1@\n',
        I2: '0 @I2@ INDI\n1 FAMC @F1@\n1 FAMS @F2@\n',
      };
      return `0 HEAD\n${order.map((id) => indi[id]).join('')}0 @F1@ FAM\n1 HUSB @I1@\n1 CHIL @I2@\n0 @F2@ FAM\n1 HUSB @I2@\n1 CHIL @I1@\n0 TRLR\n`;
    };
    expect(ids(cycle(['I1', 'I2']))).toEqual(['CIRCULAR_ANCESTRY:I1,I2']);
    expect(ids(cycle(['I2', 'I1']))).toEqual(['CIRCULAR_ANCESTRY:I1,I2']);
  });

  it('does not report a shared ancestor (a diamond) as a cycle', () => {
    // I4's parents I2 and I3 are siblings, both children of I1: two paths to
    // I1, but no loop.
    const text = `0 HEAD
0 @I1@ INDI
1 FAMS @F1@
0 @I2@ INDI
1 FAMC @F1@
1 FAMS @F2@
0 @I3@ INDI
1 FAMC @F1@
1 FAMS @F2@
0 @I4@ INDI
1 FAMC @F2@
0 @F1@ FAM
1 HUSB @I1@
1 CHIL @I2@
1 CHIL @I3@
0 @F2@ FAM
1 HUSB @I2@
1 WIFE @I3@
1 CHIL @I4@
0 TRLR
`;
    expect(ids(text)).toEqual([]);
  });

  const pair = (a: string, b: string) =>
    `0 HEAD\n0 @I1@ INDI\n1 NAME john  /SMITH/\n1 FAMS @F1@\n${a}0 @I2@ INDI\n1 NAME John /Smith/\n1 FAMS @F1@\n${b}0 @F1@ FAM\n1 HUSB @I1@\n1 WIFE @I2@\n0 TRLR\n`;

  it('matches duplicate names ignoring case, slashes and spacing', () => {
    expect(ids(pair('1 BIRT\n2 DATE 1900\n', '1 BIRT\n2 DATE 5 MAY 1900\n'))).toEqual([
      'DUPLICATE_INDIVIDUAL:I1:I2',
    ]);
  });

  it('falls back to a matching death year only when neither has a birth year', () => {
    expect(ids(pair('1 DEAT\n2 DATE 1950\n', '1 DEAT\n2 DATE 1950\n'))).toEqual([
      'DUPLICATE_INDIVIDUAL:I1:I2',
    ]);
    expect(ids(pair('1 BIRT\n2 DATE 1900\n1 DEAT\n2 DATE 1950\n', '1 DEAT\n2 DATE 1950\n'))).toEqual([]);
    expect(ids(pair('', ''))).toEqual([]);
  });

  it('does not call someone an orphan when a family lists them, even one-way', () => {
    const text = '0 HEAD\n0 @I1@ INDI\n1 NAME A\n0 @I2@ INDI\n1 NAME B\n0 @F1@ FAM\n1 CHIL @I1@\n0 TRLR\n';
    expect(ids(text)).toEqual(['ORPHAN_INDI:I2']);
  });
});
