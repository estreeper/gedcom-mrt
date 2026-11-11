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

describe('applyFix EditLine', () => {
  const target = { recordId: 'I1', path: [0] };

  it('edits level, tag and value and re-renders the line', () => {
    const db = parseText('0 @I1@ INDI\n1 NAME Old\n0 TRLR\n');
    const { db: next } = applyFix(db, {
      kind: 'EditLine', target, newLevel: 2, newTag: 'NICK', newValue: 'New',
    });
    expect(serializeDatabase(next)).toBe('0 @I1@ INDI\n2 NICK New\n0 TRLR\n');
  });

  it('derives the pointer from a new @ID@ value', () => {
    const db = parseText('0 @I1@ INDI\n1 FAMC @F1@\n0 TRLR\n');
    const toPtr = applyFix(db, { kind: 'EditLine', target, newValue: '@F2@' }).db;
    expect(toPtr.byId.get('I1')!.root.children[0].line.pointer).toBe('F2');
    const toText = applyFix(db, { kind: 'EditLine', target, newValue: 'plain' }).db;
    expect(toText.byId.get('I1')!.root.children[0].line.pointer).toBeUndefined();
  });

  it('undo restores the original line byte-for-byte, including odd spacing', () => {
    const text = '0 @I1@ INDI\n  1   NAME  Old \n0 TRLR\n';
    const db = parseText(text);
    const edited = applyFix(db, { kind: 'EditLine', target, newValue: 'New' });
    expect(serializeDatabase(edited.db)).toBe('0 @I1@ INDI\n1 NAME New\n0 TRLR\n');
    const undone = applyFix(edited.db, edited.inverse);
    expect(serializeDatabase(undone.db)).toBe(text);
    // ...and redo (the inverse of the inverse) re-applies the edit.
    expect(serializeDatabase(applyFix(undone.db, undone.inverse).db)).toBe(
      serializeDatabase(edited.db)
    );
  });

  it('undo removes a value that was added to a valueless line', () => {
    const text = '0 @I1@ INDI\n1 BIRT\n0 TRLR\n';
    const db = parseText(text);
    const edited = applyFix(db, { kind: 'EditLine', target, newValue: 'Y' });
    expect(serializeDatabase(edited.db)).toContain('1 BIRT Y');
    expect(serializeDatabase(applyFix(edited.db, edited.inverse).db)).toBe(text);
  });
});

describe('applyFix errors', () => {
  const db = parseText(CLEAN);
  it.each<[string, Fix]>([
    ['unknown record', { kind: 'RemoveNode', target: { recordId: 'NOPE', path: [0] } }],
    ['bad path', { kind: 'EditLine', target: { recordId: 'I1', path: [99] }, newValue: 'x' }],
    ['missing remove target', { kind: 'RemoveNode', target: { recordId: 'I1', path: [99] } }],
    ['remove unknown record', { kind: 'RemoveRecord', recordId: 'NOPE' }],
    ['replace unknown record', { kind: 'ReplaceRecord', recordId: 'NOPE', record: db.records[1] }],
    ['add record without id', { kind: 'AddRecord', index: 0, record: db.records[0] }],
  ])('throws on %s rather than corrupting the database', (_name, fix) => {
    expect(() => applyFix(db, fix)).toThrow();
    expect(serializeDatabase(db)).toBe(CLEAN);
  });

  it('ReplaceRecord with a changed id is undone via the new id', () => {
    const renamed = parseText('0 @I9@ INDI\n1 NAME Renamed').records[0];
    const res = applyFix(db, { kind: 'ReplaceRecord', recordId: 'I1', record: renamed });
    expect(res.db.byId.has('I1')).toBe(false);
    expect(res.inverse).toMatchObject({ kind: 'ReplaceRecord', recordId: 'I9' });
    expect(serializeDatabase(applyFix(res.db, res.inverse).db)).toBe(CLEAN);
  });
});

describe('construction helpers', () => {
  it('makeStubRecord builds a dirty level-0 record that serializes', () => {
    const stub = makeStubRecord('F9', 'FAM');
    expect(stub).toMatchObject({ id: 'F9', type: 'FAM' });
    const { db: next, inverse } = applyFix(parseText(CLEAN), { kind: 'AddRecord', index: 1, record: stub });
    expect(next.records[1].id).toBe('F9');
    expect(serializeDatabase(next)).toContain('\n0 @F9@ FAM\n');
    expect(inverse).toEqual({ kind: 'RemoveRecord', recordId: 'F9' });
  });

  it('makeNode wires children to their parent', () => {
    const child = makeNode(makeLine(2, 'DATE', { value: '1900' }));
    const parent = makeNode(makeLine(1, 'BIRT'), [child]);
    expect(child.parent).toBe(parent);
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

describe('applyFixesBatched with duplicate xrefs', () => {
  // A damaged file can define the same id twice. byId resolves to the first
  // record, so a bulk fix must edit the first and leave the duplicate alone.
  const DUP =
    '0 HEAD\n0 @I1@ INDI\n1 NAME First\n0 @I1@ INDI\n1 NAME Second\n0 TRLR\n';

  it('edits the first occurrence and preserves the duplicate record', () => {
    const db = parseText(DUP);
    const add: Fix = {
      kind: 'AddNode',
      parent: { recordId: 'I1', path: [] },
      index: 1,
      node: makeNode(makeLine(1, 'SEX', { value: 'M' })),
    };
    const { db: next } = applyFixesBatched(db, [add]);
    expect(serializeDatabase(next)).toBe(
      '0 HEAD\n0 @I1@ INDI\n1 NAME First\n1 SEX M\n0 @I1@ INDI\n1 NAME Second\n0 TRLR\n'
    );
    expect(serializeDatabase(next)).toBe(serializeDatabase(applyFix(db, add).db));
    expect(next.byType.get('INDI')).toEqual([next.records[1], next.records[2]]);
    expect(next.byId.get('I1')).toBe(next.records[1]);
  });
});

describe('applyFixesBatched edge cases', () => {
  it('skips fixes that no longer apply and ignores unsupported kinds', () => {
    const db = parseText(CLEAN);
    const { db: next, applied } = applyFixesBatched(db, [
      { kind: 'RemoveNode', target: { recordId: 'F1', path: [42] } },
      { kind: 'RemoveNode', target: { recordId: 'NOPE', path: [0] } },
      { kind: 'AddNode', parent: { recordId: 'F1', path: [9, 9] }, index: 0, node: makeNode(makeLine(2, 'X')) },
      { kind: 'RemoveRecord', recordId: 'I1' },
    ]);
    expect(applied).toEqual([]);
    expect(serializeDatabase(next)).toBe(CLEAN);
  });

  it('does not mutate the base database', () => {
    const db = parseText(CLEAN);
    applyFixesBatched(db, [{ kind: 'RemoveNode', target: { recordId: 'F1', path: [0] } }]);
    expect(serializeDatabase(db)).toBe(CLEAN);
  });
});

describe('orderBulkFixes', () => {
  it('puts removes first (deepest/last path first per record), then adds', () => {
    const add: Fix = { kind: 'AddNode', parent: { recordId: 'A', path: [] }, index: 0, node: makeNode(makeLine(1, 'X')) };
    const rm = (recordId: string, path: number[]): Fix => ({ kind: 'RemoveNode', target: { recordId, path } });
    const ordered = orderBulkFixes([
      add,
      rm('B', [0]),
      rm('A', [1]),
      rm('A', [1, 0]),
      rm('A', [3]),
      { kind: 'RemoveRecord', recordId: 'A' },
    ]);
    expect(ordered).toEqual([rm('A', [3]), rm('A', [1, 0]), rm('A', [1]), rm('B', [0]), add]);
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
