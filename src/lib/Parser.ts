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

  // stack[k] is the currently-open node at level k.
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

    const node = createNode(line);
    const parentLevel = line.level - 1;
    let parent: GedcomNode | undefined;

    if (parentLevel < stack.length) {
      parent = stack[parentLevel];
    } else if (stack.length > 0) {
      // Level jumped past its parent; attach to the deepest open node.
      parent = stack[stack.length - 1];
      parseNotes.push({
        lineNumber: line.lineNumber,
        code: 'BAD_LEVEL',
        message: `Level ${line.level} has no level ${parentLevel} parent; attached to nearest ancestor.`,
      });
    }

    if (!parent) {
      // A non-zero level with no record started yet: preserve it as its own
      // record so nothing is lost.
      parseNotes.push({
        lineNumber: line.lineNumber,
        code: 'ORPHAN_LINE',
        message: `Line at level ${line.level} appears before any level 0 record.`,
      });
      startRecord(node, 'UNKNOWN', line.xref);
      return;
    }

    node.parent = parent;
    parent.children.push(node);
    stack = stack.slice(0, parent.line.level + 1);
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
