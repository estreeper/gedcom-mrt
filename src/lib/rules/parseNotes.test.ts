import { parseText } from '../Parser';
import { applyFix, makeLine, makeNode, Fix } from '../model/Fix';
import { parseNoteRules, structuralNotes } from './parseNotes';
import * as fixtures from '../__fixtures__';

const DAMAGED: Record<string, string> = {
  malformedInRecord: '0 HEAD\n0 @I1@ INDI\n1 NAME A\nnot gedcom\n2 GIVN A\n0 TRLR\n',
  malformedFirstLine: 'garbage\n1 NAME x\n3 DEEP y\n0 TRLR\n',
  orphanLines: '1 SOUR x\n2 VERS 1\n1 DEST y\n0 HEAD\n0 TRLR\n',
  skippedLevels: '0 HEAD\n3 A\n4 B\n2 C\n3 D\n1 E\n0 TRLR\n',
  duplicateXref: '0 HEAD\n0 @I1@ INDI\n0 @I1@ INDI\n0 @I1@ INDI\n0 TRLR\n',
  blankLines: '0 HEAD\n\n0 @I1@ INDI\n\n1 NAME A\n0 TRLR\n',
};

describe('structuralNotes', () => {
  it.each(Object.entries({ ...fixtures, ...DAMAGED }))(
    'matches what the parser noted for %s',
    (_name, text) => {
      const db = parseText(text);
      expect(structuralNotes(db)).toEqual(db.parseNotes);
    }
  );

  it('finds every kind of damage across the samples', () => {
    const codes = new Set(
      Object.values(DAMAGED).flatMap((t) => structuralNotes(parseText(t)).map((n) => n.code))
    );
    expect([...codes].sort()).toEqual([
      'BAD_LEVEL',
      'DUPLICATE_XREF',
      'MALFORMED_LINE',
      'ORPHAN_LINE',
    ]);
  });
});

describe('parseNoteRules', () => {
  const ids = (text: string) => parseNoteRules(parseText(text)).map((i) => i.id);

  it('reports nothing for a clean file', () => {
    expect(parseNoteRules(parseText(fixtures.CLEAN))).toEqual([]);
  });

  it('turns each note into an invalid-tier, flag-only issue keyed by line', () => {
    const issues = parseNoteRules(parseText(DAMAGED.malformedInRecord));
    expect(issues).toEqual([
      {
        id: 'MALFORMED_LINE:4',
        category: 'MALFORMED_LINE',
        severity: 'invalid',
        message: 'Could not parse line: "not gedcom"',
        recordIds: [],
        lineNumbers: [4],
        suggestedFixes: [],
      },
    ]);
  });

  it('reports a missing header and a missing trailer', () => {
    expect(ids('0 @I1@ INDI\n')).toEqual(['MISSING_HEADER', 'MISSING_TRAILER']);
    expect(ids('0 HEAD\n0 @I1@ INDI\n')).toEqual(['MISSING_TRAILER']);
    expect(ids('')).toEqual(['MISSING_HEADER', 'MISSING_TRAILER']);
  });

  it('clears a malformed-line issue once the record is repaired', () => {
    const db = parseText(DAMAGED.malformedInRecord);
    expect(parseNoteRules(db).map((i) => i.id)).toEqual(['MALFORMED_LINE:4']);

    const repaired = parseText('0 @I1@ INDI\n1 NAME A\n2 GIVN A').records[0];
    const { db: next, inverse } = applyFix(db, {
      kind: 'ReplaceRecord',
      recordId: 'I1',
      record: repaired,
    });
    expect(parseNoteRules(next)).toEqual([]);
    // ...and undoing the repair brings the issue back.
    expect(parseNoteRules(applyFix(next, inverse).db).map((i) => i.id)).toEqual([
      'MALFORMED_LINE:4',
    ]);
  });

  it('clears a duplicate-xref issue once the duplicate is renamed', () => {
    const db = parseText('0 HEAD\n0 @I1@ INDI\n0 @I1@ INDI\n0 TRLR\n');
    expect(parseNoteRules(db).map((i) => i.id)).toEqual(['DUPLICATE_XREF:3']);
    // Removing the first leaves a single @I1@.
    const { db: next } = applyFix(db, { kind: 'RemoveRecord', recordId: 'I1' });
    expect(parseNoteRules(next)).toEqual([]);
  });

  it('gives distinct ids, and no line number, to damage on fix-created lines', () => {
    const db = parseText('0 HEAD\n0 @I1@ INDI\n0 TRLR\n');
    const add = (level: number, tag: string): Fix => ({
      kind: 'AddNode',
      parent: { recordId: 'I1', path: [] },
      index: 0,
      node: makeNode(makeLine(level, tag)),
    });
    const next = applyFix(applyFix(db, add(3, 'A')).db, add(4, 'B')).db;
    const issues = parseNoteRules(next);
    expect(issues.map((i) => i.id)).toEqual(['BAD_LEVEL:new1', 'BAD_LEVEL:new2']);
    expect(issues.every((i) => i.lineNumbers.length === 0)).toBe(true);
  });
});
