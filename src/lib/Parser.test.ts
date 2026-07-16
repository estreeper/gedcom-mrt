import { parseText } from './Parser';
import { serializeDatabase } from './model/Serialize';
import { getRecord, recordsOfType } from './model/Database';
import { getFullValue } from './model/Node';
import { CLEAN, QUIRKY } from './__fixtures__';

const toCrlf = (s: string) => s.split('\n').join('\r\n');
const toCr = (s: string) => s.split('\n').join('\r');

describe('parseText round-trip', () => {
  it('round-trips a clean file byte-for-byte', () => {
    expect(serializeDatabase(parseText(CLEAN))).toBe(CLEAN);
  });

  it('round-trips CRLF line endings', () => {
    const crlf = toCrlf(CLEAN);
    const db = parseText(crlf);
    expect(db.newline).toBe('\r\n');
    expect(serializeDatabase(db)).toBe(crlf);
  });

  it('round-trips lone-CR (old Mac) line endings', () => {
    const cr = toCr(CLEAN);
    const db = parseText(cr);
    expect(db.newline).toBe('\r');
    expect(serializeDatabase(db)).toBe(cr);
  });

  it('round-trips a leading BOM', () => {
    const withBom = '﻿' + CLEAN;
    const db = parseText(withBom);
    expect(db.hasBom).toBe(true);
    expect(serializeDatabase(db)).toBe(withBom);
  });

  it('round-trips a file with no trailing newline', () => {
    const noTrailer = CLEAN.slice(0, -1);
    const db = parseText(noTrailer);
    expect(db.trailingNewline).toBe(false);
    expect(serializeDatabase(db)).toBe(noTrailer);
  });

  it('round-trips quirky xref prefixes and custom tags', () => {
    expect(serializeDatabase(parseText(QUIRKY))).toBe(QUIRKY);
  });
});

describe('parseText indexing', () => {
  it('indexes records by id and type', () => {
    const db = parseText(CLEAN);
    expect(recordsOfType(db, 'INDI')).toHaveLength(3);
    expect(recordsOfType(db, 'FAM')).toHaveLength(1);
    expect(getRecord(db, 'I1')?.type).toBe('INDI');
    expect(getRecord(db, '@F1@')?.type).toBe('FAM');
    expect(db.header?.type).toBe('HEAD');
    expect(db.trailer?.type).toBe('TRLR');
  });

  it('indexes non-standard xref prefixes', () => {
    const db = parseText(QUIRKY);
    expect(getRecord(db, 'N1')?.type).toBe('NOTE');
  });

  it('builds a level tree', () => {
    const db = parseText(CLEAN);
    const fam = getRecord(db, 'F1')!;
    expect(fam.root.children.map((c) => c.line.tag)).toEqual([
      'HUSB', 'WIFE', 'CHIL',
    ]);
  });

  it('reports a duplicate xref', () => {
    const db = parseText('0 @I1@ INDI\n0 @I1@ INDI\n0 TRLR\n');
    expect(db.parseNotes.some((n) => n.code === 'DUPLICATE_XREF')).toBe(true);
    // First occurrence wins in the index.
    expect(getRecord(db, 'I1')).toBe(db.records[0]);
  });

  it('folds CONC/CONT into the full value', () => {
    const db = parseText(
      '0 @I1@ INDI\n1 NOTE first line\n2 CONT second line\n2 CONC  joined\n0 TRLR\n'
    );
    const note = getRecord(db, 'I1')!.root.children[0];
    expect(getFullValue(note)).toBe('first line\nsecond line joined');
  });
});
