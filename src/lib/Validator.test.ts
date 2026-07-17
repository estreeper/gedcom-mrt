import { parseText } from './Parser';
import { validate } from './Validator';
import { applyFix } from './model/Fix';
import { serializeDatabase } from './model/Serialize';
import { CLEAN, ONE_WAY, DANGLING } from './__fixtures__';

describe('validate', () => {
  it('finds no issues in a clean, symmetric file', () => {
    expect(validate(parseText(CLEAN))).toEqual([]);
  });

  describe('ASYMMETRIC_LINK', () => {
    it('detects a one-way CHIL link', () => {
      const issues = validate(parseText(ONE_WAY));
      expect(issues).toHaveLength(1);
      expect(issues[0].category).toBe('ASYMMETRIC_LINK');
      expect(issues[0].recordIds).toEqual(expect.arrayContaining(['I3', 'F1']));
    });

    it('provides a human message using names, keeping xrefs in the technical one', () => {
      const issue = validate(parseText(ONE_WAY))[0];
      // Human message resolves @I3@ to the child's name and describes the family.
      expect(issue.humanMessage).toContain('Child /Smith/');
      expect(issue.humanMessage).toContain('The family of John /Smith/ and Jane /Doe/');
      expect(issue.humanMessage).not.toContain('@I3@');
      // Technical message still uses xrefs.
      expect(issue.message).toContain('@I3@');
      expect(issue.message).toContain('@F1@');
    });

    it('suggests a fix that resolves the issue and adds the reciprocal line', () => {
      const db = parseText(ONE_WAY);
      const issue = validate(db)[0];
      const { db: fixed } = applyFix(db, issue.suggestedFixes[0].fix);

      expect(validate(fixed)).toEqual([]);
      expect(serializeDatabase(fixed)).toContain('1 FAMC @F1@');
    });
  });

  describe('DANGLING_POINTER', () => {
    it('detects a pointer to a missing record', () => {
      const issues = validate(parseText(DANGLING));
      expect(issues).toHaveLength(1);
      expect(issues[0].category).toBe('DANGLING_POINTER');
      // Offers both "remove the line" and "create a stub record".
      expect(issues[0].suggestedFixes.map((f) => f.fix.kind)).toEqual([
        'RemoveNode',
        'AddRecord',
      ]);
    });

    it('removing the dangling line resolves the issue', () => {
      const db = parseText(DANGLING);
      const remove = validate(db)[0].suggestedFixes[0].fix;
      const { db: fixed } = applyFix(db, remove);

      expect(validate(fixed)).toEqual([]);
      expect(serializeDatabase(fixed)).not.toContain('@F99@');
    });
  });
});
