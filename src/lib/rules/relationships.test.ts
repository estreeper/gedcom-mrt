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
});
