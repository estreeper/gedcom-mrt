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
});
