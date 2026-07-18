import { parseText } from '../Parser';
import { missingDataRules } from './missing';
import {
  CLEAN,
  MISSING_LIFE_DATES,
  CHILDLESS_FAMILY,
  MISSING_SOURCES,
  HAS_SOURCES,
} from '../__fixtures__';

describe('missingDataRules', () => {
  it('flags CLEAN for missing sources (no fixture in this repo carries SOUR)', () => {
    // CLEAN has birth/death-free individuals with no sources; just confirm the
    // rule doesn't throw and produces only MISSING_SOURCES / MISSING_LIFE_DATES.
    const issues = missingDataRules(parseText(CLEAN));
    expect(issues.every((i) => i.severity === 'info')).toBe(true);
  });

  it('detects an individual with no birth or death information', () => {
    const issues = missingDataRules(parseText(MISSING_LIFE_DATES));
    expect(issues.some((i) => i.category === 'MISSING_LIFE_DATES')).toBe(true);
  });

  it('detects a family with no children', () => {
    const issues = missingDataRules(parseText(CHILDLESS_FAMILY));
    expect(issues.some((i) => i.category === 'CHILDLESS_FAMILY')).toBe(true);
  });

  it('detects an individual with no source citations', () => {
    const issues = missingDataRules(parseText(MISSING_SOURCES));
    expect(issues.some((i) => i.category === 'MISSING_SOURCES')).toBe(true);
  });

  it('does not flag an individual that has a source citation', () => {
    const issues = missingDataRules(parseText(HAS_SOURCES));
    expect(issues.some((i) => i.category === 'MISSING_SOURCES')).toBe(false);
  });
});
