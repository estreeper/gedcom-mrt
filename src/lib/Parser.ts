import { tokenizeLine } from './model/Line';
import { GedcomNode, createNode } from './model/Node';
import {
  GedcomDatabase,
  GedcomRecord,
  ParseNote,
  RecordType,
  recordTypeFromTag,
} from './model/Database';

// Tolerant GEDCOM parser. Damaged files are the expected input, so parsing
// never throws: structural problems are captured as ParseNotes and every source
// line is preserved in the tree so the file can be faithfully round-tripped.

const BOM = '﻿';

interface SplitResult {
  lines: string[];
  newline: '\n' | '\r\n' | '\r';
  trailingNewline: boolean;
}

/**
 * Split text into lines by explicit scan, handling CRLF, LF and lone-CR
 * (old-Mac) endings, and reporting the dominant newline plus whether the file
 * ended with one.
 */
function splitLines(text: string): SplitResult {
  const lines: string[] = [];
  let start = 0;
  let i = 0;
  let crlf = 0;
  let lf = 0;
  let cr = 0;

  while (i < text.length) {
    const c = text.charCodeAt(i);
    if (c === 10 /* \n */) {
      lines.push(text.slice(start, i));
      lf++;
      i++;
      start = i;
    } else if (c === 13 /* \r */) {
      lines.push(text.slice(start, i));
      if (text.charCodeAt(i + 1) === 10) {
        crlf++;
        i += 2;
      } else {
        cr++;
        i++;
      }
      start = i;
    } else {
      i++;
    }
  }

  let trailingNewline: boolean;
  if (start < text.length) {
    lines.push(text.slice(start));
    trailingNewline = false;
  } else {
    trailingNewline = text.length > 0;
  }

  let newline: '\n' | '\r\n' | '\r' = '\n';
  if (crlf >= lf && crlf >= cr && crlf > 0) newline = '\r\n';
  else if (cr > lf && cr > crlf) newline = '\r';

  return { lines, newline, trailingNewline };
}

/**
 * Parse GEDCOM text into a database. Pure and synchronous — the testable core.
 */
export function parseText(text: string): GedcomDatabase {
  const hasBom = text.charCodeAt(0) === 0xfeff;
  if (hasBom) text = text.slice(BOM.length);

  const { lines, newline, trailingNewline } = splitLines(text);

  const records: GedcomRecord[] = [];
  const byId = new Map<string, GedcomRecord>();
  const byType = new Map<RecordType, GedcomRecord[]>();
  const parseNotes: ParseNote[] = [];

  // The chain of currently-open nodes, from the record root down to the most
  // recent line. In a well-formed file stack[k] is the open node at level k;
  // in a damaged one (skipped levels) depth and level can disagree, so parents
  // are found by comparing levels rather than by indexing.
  let stack: GedcomNode[] = [];

  const startRecord = (node: GedcomNode, type: RecordType, id?: string) => {
    const record: GedcomRecord = { id, type, root: node };
    records.push(record);
    stack = [node];

    const list = byType.get(type);
    if (list) list.push(record);
    else byType.set(type, [record]);

    if (id !== undefined) {
      if (byId.has(id)) {
        parseNotes.push({
          lineNumber: node.line.lineNumber,
          code: 'DUPLICATE_XREF',
          message: `Duplicate record id @${id}@; keeping the first occurrence.`,
        });
      } else {
        byId.set(id, record);
      }
    }
    return record;
  };

  lines.forEach((raw, index) => {
    const line = tokenizeLine(raw, index + 1);

    if (line.malformed) {
      parseNotes.push({
        lineNumber: line.lineNumber,
        code: 'MALFORMED_LINE',
        message: `Could not parse line: ${JSON.stringify(raw)}`,
      });
      if (stack.length > 0) {
        // Keep it inside the current record (for round-trip) without opening a
        // new level.
        const parent = stack[stack.length - 1];
        parent.children.push(createNode(line, parent));
      } else {
        startRecord(createNode(line), 'UNKNOWN', line.xref);
      }
      return;
    }

    if (line.level === 0) {
      startRecord(createNode(line), recordTypeFromTag(line.tag), line.xref);
      return;
    }

    if (stack.length === 0) {
      // A non-zero level with no record started yet: preserve it as its own
      // record so nothing is lost.
      parseNotes.push({
        lineNumber: line.lineNumber,
        code: 'ORPHAN_LINE',
        message: `Line at level ${line.level} appears before any level 0 record.`,
      });
      startRecord(createNode(line), 'UNKNOWN', line.xref);
      return;
    }

    // Close every open node that is not shallower than this line; what's left
    // on top is the nearest ancestor. The record root always stays open (it
    // counts as level 0 even when it is itself a malformed or orphan line).
    // Because the parent is always on the open chain, appending to it keeps
    // the tree's depth-first order identical to the file's line order.
    while (stack.length > 1 && stack[stack.length - 1].line.level >= line.level) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    // A root that is an orphan line keeps its own (non-zero) level, so accept
    // either reading of it as the direct parent.
    const nested =
      parent.line.level === line.level - 1 ||
      (stack.length === 1 && line.level === 1);
    if (!nested) {
      parseNotes.push({
        lineNumber: line.lineNumber,
        code: 'BAD_LEVEL',
        message: `Level ${line.level} has no level ${line.level - 1} parent; attached to nearest ancestor.`,
      });
    }

    const node = createNode(line, parent);
    parent.children.push(node);
    stack.push(node);
  });

  const header = records.find((r) => r.type === 'HEAD');
  const trailer = records.find((r) => r.type === 'TRLR');

  return {
    records,
    byId,
    byType,
    header,
    trailer,
    parseNotes,
    newline,
    trailingNewline,
    hasBom,
  };
}

/**
 * Parse a browser File into a database.
 */
export function parse(dbFile: File): Promise<GedcomDatabase> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        resolve(parseText(result));
      } else {
        reject(new Error('Expected file to be read as text.'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('File read failed.'));
    reader.readAsText(dbFile);
  });
}
