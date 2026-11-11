import { parseText } from '../Parser';
import { relationshipRules } from './relationships';
import { CLEAN, YOUNG_MARRIAGE, PLURAL_MARRIAGE } from '../__fixtures__';

describe('relationshipRules', () => {
  it('finds no issues in a clean file', () => {
    expect(relationshipRules(parseText(CLEAN))).toEqual([]);
  });

  it('detects a marriage under age 12', () => {
    const issues = relationshipRules(parseText(YOUNG_MARRIAGE));
    expect(issues.some((i) => i.category === 'YOUNG_MARRIAGE')).toBe(true);
    expect(issues.find((i) => i.category === 'YOUNG_MARRIAGE')?.severity).toBe('warning');
  });

  it('detects overlapping marriages with no recorded divorce/death in between', () => {
    const issues = relationshipRules(parseText(PLURAL_MARRIAGE));
    expect(issues.some((i) => i.category === 'PLURAL_MARRIAGE')).toBe(true);
  });

  it('does not flag sequential remarriage after a recorded divorce', () => {
    const sequential = `0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME John /Smith/
1 SEX M
1 FAMS @F1@
1 FAMS @F2@
0 @I2@ INDI
1 NAME Jane /Doe/
1 SEX F
1 FAMS @F1@
0 @I3@ INDI
1 NAME Mary /Jones/
1 SEX F
1 FAMS @F2@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 MARR
2 DATE 1 JAN 1970
1 DIV
2 DATE 1 JAN 1974
0 @F2@ FAM
1 HUSB @I1@
1 WIFE @I3@
1 MARR
2 DATE 1 JAN 1975
0 TRLR
`;
    expect(
      relationshipRules(parseText(sequential)).filter((i) => i.category === 'PLURAL_MARRIAGE')
    ).toEqual([]);
  });

  it('detects an implausibly young parent', () => {
    const young = `0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME John /Smith/
1 SEX M
1 BIRT
2 DATE 1 JAN 1980
1 FAMS @F1@
0 @I2@ INDI
1 NAME Jane /Doe/
1 SEX F
1 FAMS @F1@
0 @I3@ INDI
1 NAME Child /Smith/
1 BIRT
2 DATE 1 JAN 1990
1 FAMC @F1@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
0 TRLR
`;
    const issues = relationshipRules(parseText(young));
    expect(issues.some((i) => i.category === 'IMPLAUSIBLE_PARENT_AGE')).toBe(true);
  });

  const twoMarriages = (extraI1: string, f1Extra: string, others = '') => `0 HEAD
0 @I1@ INDI
1 NAME John /Smith/
1 FAMS @F1@
1 FAMS @F2@
${extraI1}0 @I2@ INDI
1 NAME Jane /Doe/
1 FAMS @F1@
${others}0 @I3@ INDI
1 NAME Mary /Jones/
1 FAMS @F2@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 MARR
2 DATE 1 JAN 1970
${f1Extra}0 @F2@ FAM
1 HUSB @I1@
1 WIFE @I3@
1 MARR
2 DATE 1 JAN 1975
0 TRLR
`;
  const plural = (text: string) =>
    relationshipRules(parseText(text)).filter((i) => i.category === 'PLURAL_MARRIAGE');

  it('does not flag remarriage after the first spouse died', () => {
    const widowed = twoMarriages('', '').replace(
      '1 NAME Jane /Doe/\n',
      '1 NAME Jane /Doe/\n1 DEAT\n2 DATE 1 JAN 1972\n'
    );
    expect(plural(widowed)).toEqual([]);
  });

  it('flags the remarrying spouse only, with both families named', () => {
    const issues = plural(twoMarriages('', ''));
    expect(issues.map((i) => i.id)).toEqual(['PLURAL_MARRIAGE:I1:F1:F2']);
    expect(issues[0].recordIds).toEqual(['I1', 'F1', 'F2']);
  });

  it('treats a FAMS listed twice as one marriage, not two overlapping ones', () => {
    const text = `0 HEAD
0 @I1@ INDI
1 FAMS @F1@
1 FAMS @F1@
0 @F1@ FAM
1 HUSB @I1@
1 MARR
2 DATE 1970
0 TRLR
`;
    expect(plural(text)).toEqual([]);
  });

  it('ignores marriages with no usable date and FAMS to missing families', () => {
    const text = twoMarriages('1 FAMS @F9@\n', '').replace('2 DATE 1 JAN 1975', '2 DATE unknown');
    expect(plural(text)).toEqual([]);
  });

  const parentChild = (parentTag: string, parentBirth: string, childBirth: string) => `0 HEAD
0 @I1@ INDI
1 NAME Pat /Lee/
1 BIRT
2 DATE ${parentBirth}
0 @I2@ INDI
1 NAME Kid /Lee/
1 BIRT
2 DATE ${childBirth}
0 @F1@ FAM
1 ${parentTag} @I1@
1 CHIL @I2@
0 TRLR
`;
  const parentAge = (text: string) =>
    relationshipRules(parseText(text)).filter((i) => i.category === 'IMPLAUSIBLE_PARENT_AGE');

  it('flags an implausibly old mother but not an equally old father', () => {
    const mother = parentAge(parentChild('WIFE', '1900', '1965'));
    expect(mother.map((i) => i.id)).toEqual(['IMPLAUSIBLE_PARENT_AGE:I1:I2']);
    expect(mother[0].message).toContain('(mother) was about 65 years old');
    expect(mother[0].quickEdit?.map((q) => q.label)).toEqual([
      "Mother's birth date",
      "Child's birth date",
    ]);
    expect(parentAge(parentChild('HUSB', '1900', '1965'))).toEqual([]);
  });

  it('leaves a parent born after the child to the impossible-date rules', () => {
    expect(parentAge(parentChild('HUSB', '1980', '1970'))).toEqual([]);
  });

  it('accepts ordinary parent ages and skips undated people', () => {
    expect(parentAge(parentChild('WIFE', '1900', '1930'))).toEqual([]);
    expect(parentAge(parentChild('WIFE', 'unknown', '1930'))).toEqual([]);
    expect(parentAge(parentChild('WIFE', '1900', 'unknown'))).toEqual([]);
  });

  it('does not call a marriage dated before the spouse was born a young marriage', () => {
    const text = `0 HEAD
0 @I1@ INDI
1 BIRT
2 DATE 1950
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I9@
1 MARR
2 DATE 1940
0 TRLR
`;
    expect(relationshipRules(parseText(text))).toEqual([]);
  });
});
