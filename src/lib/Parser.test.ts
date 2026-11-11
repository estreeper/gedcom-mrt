import { parse, parseText } from './Parser';
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

describe('parseText on damaged input', () => {
  const notes = (text: string) => parseText(text).parseNotes.map((n) => `${n.code}:${n.lineNumber}`);

  it('never throws and returns an empty database for empty text', () => {
    const db = parseText('');
    expect(db.records).toEqual([]);
    expect(db.trailingNewline).toBe(false);
    expect(serializeDatabase(db)).toBe('');
  });

  it('keeps line order when levels are skipped and then step back', () => {
    // 3 has no level-2 parent; the later "2 C" must not capture "3 D" under an
    // earlier sibling (which would reorder the lines on export).
    const text = '0 HEAD\n3 A\n4 B\n2 C\n3 D\n1 E\n0 TRLR\n';
    const db = parseText(text);
    expect(serializeDatabase(db)).toBe(text);
    expect(notes(text)).toEqual(['BAD_LEVEL:2', 'BAD_LEVEL:4']);
    const head = db.records[0].root;
    expect(head.children.map((c) => c.line.tag)).toEqual(['A', 'C', 'E']);
    expect(head.children[0].children.map((c) => c.line.tag)).toEqual(['B']);
    expect(head.children[1].children.map((c) => c.line.tag)).toEqual(['D']);
  });

  it('keeps a malformed line inside the current record without opening a level', () => {
    const text = '0 @I1@ INDI\n1 NAME A\nnot gedcom\n2 GIVN A\n0 TRLR\n';
    const db = parseText(text);
    expect(serializeDatabase(db)).toBe(text);
    expect(notes(text)).toEqual(['MALFORMED_LINE:3']);
    const name = getRecord(db, 'I1')!.root.children[0];
    expect(name.children.map((c) => c.line.malformed)).toEqual([true, false]);
  });

  it('preserves lines that appear before any level-0 record', () => {
    const text = '1 SOUR x\n2 VERS 1\ngarbage\n0 HEAD\n0 TRLR\n';
    const db = parseText(text);
    expect(serializeDatabase(db)).toBe(text);
    expect(notes(text)).toEqual(['ORPHAN_LINE:1', 'MALFORMED_LINE:3']);
    expect(db.records[0].type).toBe('UNKNOWN');
    expect(db.records[0].root.children[0].line.tag).toBe('VERS');
  });

  it('starts an UNKNOWN record for a malformed first line', () => {
    const text = 'garbage\n1 NAME x\n0 TRLR\n';
    const db = parseText(text);
    expect(serializeDatabase(db)).toBe(text);
    expect(db.records[0].type).toBe('UNKNOWN');
    expect(notes(text)).toEqual(['MALFORMED_LINE:1']);
  });

  it('picks the dominant newline for mixed line endings', () => {
    expect(parseText('0 HEAD\r\n0 @I1@ INDI\r\n0 TRLR\n').newline).toBe('\r\n');
    expect(parseText('0 HEAD\r0 @I1@ INDI\r0 TRLR\n').newline).toBe('\r');
    expect(parseText('0 HEAD\n0 @I1@ INDI\n0 TRLR\r\n').newline).toBe('\n');
  });

  it('treats unrecognized level-0 tags as UNKNOWN records', () => {
    const db = parseText('0 @X1@ _CUSTOM\n0 TRLR\n');
    expect(getRecord(db, 'X1')?.type).toBe('UNKNOWN');
    expect(recordsOfType(db, 'SOUR')).toEqual([]);
  });
});

describe('parse (File wrapper)', () => {
  it('reads a File as text and parses it', async () => {
    const db = await parse(new File([CLEAN], 'clean.ged', { type: 'text/plain' }));
    expect(serializeDatabase(db)).toBe(CLEAN);
  });

  it('rejects when the file cannot be read', async () => {
    const original = globalThis.FileReader;
    class FailingReader {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      result = null;
      error = new Error('boom');
      readAsText() {
        queueMicrotask(() => this.onerror?.());
      }
    }
    globalThis.FileReader = FailingReader as unknown as typeof FileReader;
    try {
      await expect(parse(new File(['x'], 'x.ged'))).rejects.toThrow('boom');
    } finally {
      globalThis.FileReader = original;
    }
  });
});
