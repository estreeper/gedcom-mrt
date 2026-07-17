import { parseText } from '../Parser';
import { serializeDatabase } from './Serialize';
import {
  applyFix,
  applyFixesBatched,
  orderBulkFixes,
  makeLine,
  makeNode,
  makeStubRecord,
  previewFix,
  Fix,
} from './Fix';
import { CLEAN } from '../__fixtures__';

// A distinctive line the CLEAN fixture does not already contain.
const addRfnToI3: Fix = {
  kind: 'AddNode',
  parent: { recordId: 'I3', path: [] },
  index: 2,
  node: makeNode(makeLine(1, 'RFN', { value: 'unique-marker' })),
};

describe('applyFix', () => {
  it('does not mutate the input database', () => {
    const db = parseText(CLEAN);
    const before = serializeDatabase(db);
    applyFix(db, addRfnToI3);
    expect(serializeDatabase(db)).toBe(before);
  });

  it('AddNode inserts a line that serializes', () => {
    const db = parseText(CLEAN);
    const { db: next } = applyFix(db, addRfnToI3);
    expect(serializeDatabase(next)).toContain('1 RFN unique-marker');
  });

  it('AddNode then its inverse restores the original text', () => {
    const db = parseText(CLEAN);
    const original = serializeDatabase(db);
    const { db: added, inverse } = applyFix(db, addRfnToI3);
    const { db: restored } = applyFix(added, inverse);
    expect(serializeDatabase(restored)).toBe(original);
  });

  it('RemoveNode then its inverse restores the original text byte-for-byte', () => {
    const db = parseText(CLEAN);
    const original = serializeDatabase(db);
    // Remove @F1@'s first child (HUSB) and put it back.
    const remove: Fix = { kind: 'RemoveNode', target: { recordId: 'F1', path: [0] } };
    const { db: removed, inverse } = applyFix(db, remove);
    expect(serializeDatabase(removed)).not.toContain('1 HUSB @I1@');
    const { db: restored } = applyFix(removed, inverse);
    expect(serializeDatabase(restored)).toBe(original);
  });

  it('ReplaceRecord swaps a record and its inverse restores the original', () => {
    const db = parseText(CLEAN);
    const original = serializeDatabase(db);
    // A trimmed-down @F1@ with only the HUSB line.
    const replacement = parseText('0 @F1@ FAM\n1 HUSB @I1@\n').records[0];
    const { db: replaced, inverse } = applyFix(db, {
      kind: 'ReplaceRecord',
      recordId: 'F1',
      record: replacement,
    });
    const text = serializeDatabase(replaced);
    expect(text).toContain('1 HUSB @I1@');
    expect(text).not.toContain('1 WIFE @I2@');
    const { db: restored } = applyFix(replaced, inverse);
    expect(serializeDatabase(restored)).toBe(original);
  });

  it('AddRecord then RemoveRecord inverse restores the original text', () => {
    const db = parseText(CLEAN);
    const original = serializeDatabase(db);
    const add: Fix = {
      kind: 'AddRecord',
      index: db.records.length - 1, // before TRLR
      record: makeStubRecord('X9', 'NOTE'),
    };
    const { db: added, inverse } = applyFix(db, add);
    expect(serializeDatabase(added)).toContain('0 @X9@ NOTE');
    const { db: restored } = applyFix(added, inverse);
    expect(serializeDatabase(restored)).toBe(original);
  });
});

describe('applyFixesBatched', () => {
  it('removes multiple lines from one record in the right order', () => {
    const db = parseText(CLEAN);
    // @F1@ children: HUSB [0], WIFE [1], CHIL [2]. Remove HUSB and CHIL.
    const fixes = orderBulkFixes([
      { kind: 'RemoveNode', target: { recordId: 'F1', path: [0] } },
      { kind: 'RemoveNode', target: { recordId: 'F1', path: [2] } },
    ]);
    const { db: next, applied } = applyFixesBatched(db, fixes);
    const text = serializeDatabase(next);
    expect(text).not.toContain('1 HUSB @I1@');
    expect(text).not.toContain('1 CHIL @I3@');
    expect(text).toContain('1 WIFE @I2@');
    expect(applied).toHaveLength(2);
  });

  it('is reversible: applying the inverses restores the original text', () => {
    const db = parseText(CLEAN);
    const original = serializeDatabase(db);
    const fixes = orderBulkFixes([
      { kind: 'RemoveNode', target: { recordId: 'F1', path: [0] } },
      { kind: 'RemoveNode', target: { recordId: 'F1', path: [2] } },
      { kind: 'AddNode', parent: { recordId: 'I3', path: [] }, index: 99, node: makeNode(makeLine(1, 'FAMS', { pointer: 'F1' })) },
    ]);
    const { db: next, applied } = applyFixesBatched(db, fixes);
    let undo = next;
    for (let i = applied.length - 1; i >= 0; i--) {
      undo = applyFix(undo, applied[i].inverse).db;
    }
    expect(serializeDatabase(undo)).toBe(original);
  });

  it('matches sequential applyFix for independent AddNode fixes', () => {
    const db = parseText(CLEAN);
    const addA: Fix = { kind: 'AddNode', parent: { recordId: 'I1', path: [] }, index: 99, node: makeNode(makeLine(1, 'RFN', { value: 'a' })) };
    const addB: Fix = { kind: 'AddNode', parent: { recordId: 'I2', path: [] }, index: 99, node: makeNode(makeLine(1, 'RFN', { value: 'b' })) };
    const batched = serializeDatabase(applyFixesBatched(db, orderBulkFixes([addA, addB])).db);
    const seq = serializeDatabase(applyFix(applyFix(db, addA).db, addB).db);
    expect(batched).toBe(seq);
  });
});

describe('previewFix', () => {
  it('shows the before and after of the affected record', () => {
    const db = parseText(CLEAN);
    const { before, after } = previewFix(db, addRfnToI3);
    expect(before).not.toContain('RFN');
    expect(after).toContain('1 RFN unique-marker');
  });
});
