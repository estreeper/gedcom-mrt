import { GedcomDatabase, ParseNote } from '../model/Database';
import { GedcomNode } from '../model/Node';
import { Issue } from '../model/Issue';

// Surfaces structural damage — malformed lines, bad level nesting, duplicate
// xrefs, lines outside any record — as first-class issues, plus a missing
// HEAD/TRLR. All of these are fingerprints of a damaged file — not something a
// person typed on purpose — so they sit at the top 'invalid' tier, alongside
// the broken-link checks in Validator.ts. Flag-only: there's no safe way to
// reconstruct a missing header/trailer or guess what a malformed line meant.
//
// The parser records the same findings as `db.parseNotes`, but that is a
// snapshot of the file as it was read. Issues must describe the database as it
// is NOW (after a manual edit repairs a malformed line, its issue has to
// clear), so the notes are re-derived here from the current record trees.

/**
 * The structural problems present in the current record trees. For a freshly
 * parsed database this equals `db.parseNotes` (see the parity test).
 */
export function structuralNotes(db: GedcomDatabase): ParseNote[] {
  const notes: ParseNote[] = [];
  const seenIds = new Set<string>();

  const visit = (node: GedcomNode, parent: GedcomNode, parentIsRoot: boolean) => {
    const { line } = node;
    if (line.malformed) {
      notes.push(malformedNote(line.lineNumber, line.raw));
    } else {
      const nested =
        parent.line.level === line.level - 1 || (parentIsRoot && line.level === 1);
      if (!nested) {
        notes.push({
          lineNumber: line.lineNumber,
          code: 'BAD_LEVEL',
          message: `Level ${line.level} has no level ${line.level - 1} parent; attached to nearest ancestor.`,
        });
      }
    }
    for (const child of node.children) visit(child, node, false);
  };

  for (const record of db.records) {
    const { line } = record.root;
    if (line.malformed) {
      notes.push(malformedNote(line.lineNumber, line.raw));
    } else if (line.level !== 0) {
      notes.push({
        lineNumber: line.lineNumber,
        code: 'ORPHAN_LINE',
        message: `Line at level ${line.level} appears before any level 0 record.`,
      });
    }
    if (record.id !== undefined) {
      if (seenIds.has(record.id)) {
        notes.push({
          lineNumber: line.lineNumber,
          code: 'DUPLICATE_XREF',
          message: `Duplicate record id @${record.id}@; keeping the first occurrence.`,
        });
      } else {
        seenIds.add(record.id);
      }
    }
    for (const child of record.root.children) visit(child, record.root, true);
  }

  return notes;
}

function malformedNote(lineNumber: number, raw: string): ParseNote {
  return {
    lineNumber,
    code: 'MALFORMED_LINE',
    message: `Could not parse line: ${JSON.stringify(raw)}`,
  };
}

export function parseNoteRules(db: GedcomDatabase): Issue[] {
  const issues: Issue[] = [];
  // Lines created by a fix or a manual edit have no source line number; number
  // those within their category so their ids stay distinct.
  const unnumbered = new Map<string, number>();

  for (const note of structuralNotes(db)) {
    let key = String(note.lineNumber);
    if (note.lineNumber < 1) {
      const n = (unnumbered.get(note.code) ?? 0) + 1;
      unnumbered.set(note.code, n);
      key = `new${n}`;
    }
    issues.push({
      id: `${note.code}:${key}`,
      category: note.code,
      severity: 'invalid',
      message: note.message,
      recordIds: [],
      lineNumbers: note.lineNumber >= 1 ? [note.lineNumber] : [],
      suggestedFixes: [],
    });
  }

  if (!db.header) {
    issues.push({
      id: 'MISSING_HEADER',
      category: 'MISSING_HEADER',
      severity: 'invalid',
      message: 'The file has no HEAD record.',
      humanMessage: 'This file is missing its header record.',
      recordIds: [],
      lineNumbers: [],
      suggestedFixes: [],
    });
  }

  if (!db.trailer) {
    issues.push({
      id: 'MISSING_TRAILER',
      category: 'MISSING_TRAILER',
      severity: 'invalid',
      message: 'The file has no TRLR record.',
      humanMessage: 'This file is missing its trailer record.',
      recordIds: [],
      lineNumbers: [],
      suggestedFixes: [],
    });
  }

  return issues;
}
