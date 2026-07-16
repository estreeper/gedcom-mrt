import { GedcomLine } from './Line';
import { GedcomNode } from './Node';
import { serializeNode } from './Serialize';
import {
  GedcomDatabase,
  GedcomRecord,
  RecordType,
  recordTypeFromTag,
} from './Database';

// Reviewable, applyable, reversible edit operations over the model.
//
// Every fix — whether an accepted suggestion or a manual edit — flows through
// applyFix, which returns a NEW database plus the inverse fix (for undo). Fixes
// address nodes by a path of child indices from a record's root, so they stay
// valid across re-parsing and never depend on mutable object identity.

export interface NodePath {
  recordId: string;
  /** Child indices from the record root; [] is the root itself. */
  path: number[];
}

export type Fix =
  | { kind: 'AddNode'; parent: NodePath; index: number; node: GedcomNode }
  | { kind: 'RemoveNode'; target: NodePath }
  | {
      kind: 'EditLine';
      target: NodePath;
      newLevel?: number;
      newTag?: string;
      newValue?: string;
    }
  | { kind: 'AddRecord'; index: number; record: GedcomRecord }
  | { kind: 'RemoveRecord'; recordId: string };

// --- construction helpers --------------------------------------------------

/** Build a fresh (dirty) line to be inserted by a fix. */
export function makeLine(
  level: number,
  tag: string,
  opts: { value?: string; pointer?: string; xref?: string } = {}
): GedcomLine {
  return {
    lineNumber: -1,
    raw: '',
    level,
    tag,
    xref: opts.xref,
    value: opts.value,
    pointer: opts.pointer,
    malformed: false,
    dirty: true,
  };
}

/** Build a fresh node (optionally with children) to be inserted by a fix. */
export function makeNode(line: GedcomLine, children: GedcomNode[] = []): GedcomNode {
  const node: GedcomNode = { line, children };
  for (const c of children) c.parent = node;
  return node;
}

/** Build a minimal stub record (e.g. `0 @F99@ FAM`) to satisfy a pointer. */
export function makeStubRecord(id: string, type: RecordType): GedcomRecord {
  return { id, type, root: makeNode(makeLine(0, type, { xref: id })) };
}

// --- internals -------------------------------------------------------------

function cloneNode(n: GedcomNode, parent?: GedcomNode): GedcomNode {
  const copy: GedcomNode = { line: { ...n.line }, children: [], parent };
  copy.children = n.children.map((c) => cloneNode(c, copy));
  return copy;
}

function cloneRecord(r: GedcomRecord): GedcomRecord {
  return { ...r, root: cloneNode(r.root) };
}

function resolveByPath(root: GedcomNode, path: number[]): GedcomNode {
  let node = root;
  for (const idx of path) {
    const next = node.children[idx];
    if (!next) throw new Error(`Invalid node path segment ${idx}`);
    node = next;
  }
  return node;
}

function requireRecord(db: GedcomDatabase, id: string): GedcomRecord {
  const rec = db.byId.get(id);
  if (!rec) throw new Error(`No record with id @${id}@`);
  return rec;
}

/** Rebuild the derived indexes after the records array changes. */
function rebuild(db: GedcomDatabase, records: GedcomRecord[]): GedcomDatabase {
  const byId = new Map<string, GedcomRecord>();
  const byType = new Map<RecordType, GedcomRecord[]>();
  for (const r of records) {
    if (r.id !== undefined && !byId.has(r.id)) byId.set(r.id, r);
    const list = byType.get(r.type);
    if (list) list.push(r);
    else byType.set(r.type, [r]);
  }
  return {
    ...db,
    records,
    byId,
    byType,
    header: records.find((r) => r.type === 'HEAD'),
    trailer: records.find((r) => r.type === 'TRLR'),
  };
}

export interface FixResult {
  db: GedcomDatabase;
  inverse: Fix;
}

/** Apply a fix, returning a new database and the fix that undoes it. */
export function applyFix(db: GedcomDatabase, fix: Fix): FixResult {
  switch (fix.kind) {
    case 'AddNode': {
      const rec = requireRecord(db, fix.parent.recordId);
      const newRec = cloneRecord(rec);
      const parentNode = resolveByPath(newRec.root, fix.parent.path);
      const inserted = cloneNode(fix.node, parentNode);
      parentNode.children.splice(fix.index, 0, inserted);
      const records = db.records.map((r) => (r === rec ? newRec : r));
      return {
        db: rebuild(db, records),
        inverse: {
          kind: 'RemoveNode',
          target: {
            recordId: fix.parent.recordId,
            path: [...fix.parent.path, fix.index],
          },
        },
      };
    }

    case 'RemoveNode': {
      const rec = requireRecord(db, fix.target.recordId);
      const newRec = cloneRecord(rec);
      const parentPath = fix.target.path.slice(0, -1);
      const idx = fix.target.path[fix.target.path.length - 1];
      const parentNode = resolveByPath(newRec.root, parentPath);
      const removed = parentNode.children[idx];
      if (!removed) throw new Error('RemoveNode: target does not exist');
      parentNode.children.splice(idx, 1);
      const records = db.records.map((r) => (r === rec ? newRec : r));
      return {
        db: rebuild(db, records),
        inverse: {
          kind: 'AddNode',
          parent: { recordId: fix.target.recordId, path: parentPath },
          index: idx,
          node: cloneNode(removed), // detached subtree, original lines intact
        },
      };
    }

    case 'EditLine': {
      const rec = requireRecord(db, fix.target.recordId);
      const newRec = cloneRecord(rec);
      const node = resolveByPath(newRec.root, fix.target.path);
      const old = node.line;
      const inverse: Fix = {
        kind: 'EditLine',
        target: fix.target,
        newLevel: old.level,
        newTag: old.tag,
        newValue: old.value,
      };
      const next: GedcomLine = { ...old, dirty: true };
      if (fix.newLevel !== undefined) next.level = fix.newLevel;
      if (fix.newTag !== undefined) next.tag = fix.newTag;
      if (fix.newValue !== undefined) {
        next.value = fix.newValue;
        next.pointer = pointerOf(fix.newValue);
      }
      node.line = next;
      const records = db.records.map((r) => (r === rec ? newRec : r));
      return { db: rebuild(db, records), inverse };
    }

    case 'AddRecord': {
      const records = [...db.records];
      records.splice(fix.index, 0, cloneRecord(fix.record));
      if (fix.record.id === undefined) {
        throw new Error('AddRecord requires a record id for reversibility');
      }
      return {
        db: rebuild(db, records),
        inverse: { kind: 'RemoveRecord', recordId: fix.record.id },
      };
    }

    case 'RemoveRecord': {
      const index = db.records.findIndex((r) => r.id === fix.recordId);
      if (index < 0) throw new Error(`No record with id @${fix.recordId}@`);
      const removed = db.records[index];
      const records = db.records.filter((_, i) => i !== index);
      return {
        db: rebuild(db, records),
        inverse: { kind: 'AddRecord', index, record: cloneRecord(removed) },
      };
    }
  }
}

function pointerOf(value: string): string | undefined {
  if (
    value.length >= 3 &&
    value[0] === '@' &&
    value[value.length - 1] === '@'
  ) {
    const inner = value.slice(1, -1);
    if (inner.length > 0 && inner.indexOf('@') === -1) return inner;
  }
  return undefined;
}

function affectedRecordId(fix: Fix): string | undefined {
  switch (fix.kind) {
    case 'AddNode':
      return fix.parent.recordId;
    case 'RemoveNode':
    case 'EditLine':
      return fix.target.recordId;
    case 'AddRecord':
      return fix.record.id;
    case 'RemoveRecord':
      return fix.recordId;
  }
}

/** Before/after text of the record a fix touches, for a review diff. */
export function previewFix(
  db: GedcomDatabase,
  fix: Fix
): { before: string; after: string } {
  const id = affectedRecordId(fix);
  const beforeRec = id ? db.byId.get(id) : undefined;
  const before = beforeRec ? serializeNode(beforeRec.root) : '';
  const { db: nextDb } = applyFix(db, fix);
  const afterRec = id ? nextDb.byId.get(id) : undefined;
  const after = afterRec ? serializeNode(afterRec.root) : '';
  return { before, after };
}

// Re-exported so callers building AddRecord stubs don't import Database too.
export { recordTypeFromTag };
