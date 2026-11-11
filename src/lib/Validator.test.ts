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

    it('removing the dangling line resolves the issue (leaving @I1@ genuinely unlinked)', () => {
      const db = parseText(DANGLING);
      const remove = validate(db)[0].suggestedFixes[0].fix;
      const { db: fixed } = applyFix(db, remove);

      // The DANGLING_POINTER is gone; since @I1@'s only family link was the
      // broken one, it's now correctly flagged as unlinked (ORPHAN_INDI) —
      // an accurate finding, not a regression.
      const remaining = validate(fixed);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].category).toBe('ORPHAN_INDI');
      expect(serializeDatabase(fixed)).not.toContain('@F99@');
    });
  });

  describe('ASYMMETRIC_LINK from the individual side', () => {
    const family = (indiLines: string, famLines = '') =>
      parseText(`0 HEAD\n0 @I1@ INDI\n1 NAME Pat /Lee/\n${indiLines}0 @F1@ FAM\n${famLines}0 TRLR\n`);
    const links = (db: ReturnType<typeof parseText>) =>
      validate(db).filter((i) => i.category === 'ASYMMETRIC_LINK');

    it('detects a FAMC with no CHIL back and fixes it by adding the CHIL', () => {
      const db = family('1 FAMC @F1@\n');
      const [issue] = links(db);
      expect(issue.id).toBe('ASYMMETRIC_LINK:F1:CHIL:I1');
      expect(issue.suggestedFixes.map((f) => f.label)).toEqual(['Add CHIL @I1@ to @F1@']);
      const next = applyFix(db, issue.suggestedFixes[0].fix).db;
      expect(serializeDatabase(next)).toContain('0 @F1@ FAM\n1 CHIL @I1@\n');
      expect(links(next)).toEqual([]);
    });

    it.each([
      ['M', ['Add HUSB @I1@ to @F1@', 'Add WIFE @I1@ to @F1@']],
      ['F', ['Add WIFE @I1@ to @F1@', 'Add HUSB @I1@ to @F1@']],
      ['', ['Add HUSB @I1@ to @F1@', 'Add WIFE @I1@ to @F1@']],
    ])('for a FAMS with no spouse back, orders the role fixes by SEX %s', (sex, labels) => {
      const db = family(`${sex ? `1 SEX ${sex}\n` : ''}1 FAMS @F1@\n`);
      const [issue] = links(db);
      expect(issue.id).toBe('ASYMMETRIC_LINK:F1:SPOUSE:I1');
      expect(issue.suggestedFixes.map((f) => f.label)).toEqual(labels);
      expect(links(applyFix(db, issue.suggestedFixes[0].fix).db)).toEqual([]);
    });

    it('accepts either spouse role as the back-link', () => {
      expect(links(family('1 FAMS @F1@\n', '1 WIFE @I1@\n'))).toEqual([]);
      expect(links(family('1 FAMS @F1@\n', '1 HUSB @I1@\n'))).toEqual([]);
    });

    it('detects a HUSB with no FAMS back', () => {
      const [issue] = links(family('', '1 HUSB @I1@\n'));
      expect(issue.id).toBe('ASYMMETRIC_LINK:I1:FAMS:F1');
      expect(issue.humanMessage).toContain('as a spouse');
    });

    it('leaves pointers to missing records to the dangling-pointer rule', () => {
      const db = parseText('0 HEAD\n0 @F1@ FAM\n1 CHIL @I9@\n0 TRLR\n');
      expect(validate(db).map((i) => i.category)).toEqual(['DANGLING_POINTER']);
    });
  });

  describe('DANGLING_POINTER fixes', () => {
    it('offers a stub record, inserted before the trailer, that resolves it', () => {
      const db = parseText(DANGLING);
      const issue = validate(db).find((i) => i.category === 'DANGLING_POINTER')!;
      const stub = issue.suggestedFixes.find((f) => f.fix.kind === 'AddRecord')!;
      expect(stub.label).toBe('Create a stub FAM record @F99@');
      const next = applyFix(db, stub.fix).db;
      expect(serializeDatabase(next)).toMatch(/0 @F99@ FAM\n0 TRLR\n$/);
      expect(validate(next).some((i) => i.category === 'DANGLING_POINTER')).toBe(false);
    });

    it('appends the stub when the file has no trailer', () => {
      const db = parseText('0 HEAD\n0 @I1@ INDI\n1 FAMS @F9@\n');
      const issue = validate(db).find((i) => i.category === 'DANGLING_POINTER')!;
      const stub = issue.suggestedFixes.find((f) => f.fix.kind === 'AddRecord')!;
      expect(applyFix(db, stub.fix).db.records.at(-1)?.id).toBe('F9');
    });

    it('offers only a stub for a pointer in a record without an id (HEAD)', () => {
      const db = parseText('0 HEAD\n1 SUBM @U1@\n0 TRLR\n');
      const [issue] = validate(db);
      expect(issue.id).toBe('DANGLING_POINTER:?:SUBM:U1:2');
      expect(issue.message).toBe('A record points to @U1@ via SUBM, but no such record exists.');
      expect(issue.recordIds).toEqual([]);
      expect(issue.suggestedFixes.map((f) => f.fix.kind)).toEqual(['AddRecord']);
    });

    it('offers only removal for a pointer tag with no known record type', () => {
      const db = parseText('0 HEAD\n0 @I1@ INDI\n1 NAME A\n1 FAMS @F1@\n1 ASSO @I7@\n0 @F1@ FAM\n1 HUSB @I1@\n1 CHIL @I1@\n0 TRLR\n');
      const issue = validate(db).find((i) => i.category === 'DANGLING_POINTER')!;
      expect(issue.humanMessage).toBe('A refers to a record that is missing from the file.');
      expect(issue.suggestedFixes.map((f) => f.fix.kind)).toEqual(['RemoveNode']);
    });

    it('finds dangling pointers nested below the first level', () => {
      const db = parseText('0 HEAD\n0 @I1@ INDI\n1 BIRT\n2 SOUR @S9@\n0 TRLR\n');
      const issue = validate(db).find((i) => i.category === 'DANGLING_POINTER')!;
      expect(issue.suggestedFixes[0].fix).toEqual({
        kind: 'RemoveNode',
        target: { recordId: 'I1', path: [0, 0] },
      });
    });
  });

  it('reports each finding once even when the file states it twice', () => {
    // The same CHIL on two lines is one missing back-link, not two.
    const db = parseText(
      '0 HEAD\n0 @I1@ INDI\n1 NAME A\n1 SOUR x\n1 BIRT\n0 @F1@ FAM\n1 CHIL @I1@\n1 CHIL @I1@\n0 TRLR\n'
    );
    const ids = validate(db).map((i) => i.id);
    expect(ids).toEqual(['ASYMMETRIC_LINK:I1:FAMC:F1']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('produces unique issue ids for every fixture', async () => {
    const fixtures = await import('./__fixtures__');
    for (const text of Object.values(fixtures)) {
      const ids = validate(parseText(text)).map((i) => i.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
