import { GedcomLine } from './Line';
import { GedcomNode } from './Node';
import { GedcomDatabase } from './Database';

// Serialize the model back to GEDCOM text.
//
// Fidelity rule: a node that was never touched by a fix emits its original
// `raw` text verbatim, so parsing then serializing an untouched file is
// byte-identical (modulo a normalized newline). Only fix-created or fix-edited
// lines (marked `dirty`) are re-rendered from their structured fields.

const BOM = '﻿';

/** Render a single line from its structured fields. */
export function renderLine(line: GedcomLine): string {
  let out = String(line.level);
  if (line.xref) out += ' @' + line.xref + '@';
  out += ' ' + line.tag;

  let value = line.value;
  if (value === undefined && line.pointer) value = '@' + line.pointer + '@';
  if (value !== undefined && value !== '') out += ' ' + value;

  return out;
}

function lineText(line: GedcomLine): string {
  return line.dirty ? renderLine(line) : line.raw;
}

function collectNode(node: GedcomNode, out: string[]): void {
  out.push(lineText(node.line));
  for (const child of node.children) collectNode(child, out);
}

/** Serialize a single node (and its subtree) — used for diff previews. */
export function serializeNode(node: GedcomNode): string {
  const lines: string[] = [];
  collectNode(node, lines);
  return lines.join('\n');
}

/** Serialize the whole database back to GEDCOM text. */
export function serializeDatabase(db: GedcomDatabase): string {
  const lines: string[] = [];
  for (const record of db.records) collectNode(record.root, lines);

  let text = lines.join(db.newline);
  if (db.trailingNewline) text += db.newline;
  if (db.hasBom) text = BOM + text;
  return text;
}
