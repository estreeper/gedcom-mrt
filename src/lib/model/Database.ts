import { GedcomNode } from './Node';

// The parsed representation of a GEDCOM file.

export type RecordType =
  | 'HEAD'
  | 'TRLR'
  | 'INDI'
  | 'FAM'
  | 'SOUR'
  | 'REPO'
  | 'NOTE'
  | 'OBJE'
  | 'SUBM'
  | 'SUBN'
  | 'UNKNOWN';

const KNOWN_RECORD_TYPES: RecordType[] = [
  'HEAD', 'TRLR', 'INDI', 'FAM', 'SOUR', 'REPO', 'NOTE', 'OBJE', 'SUBM', 'SUBN',
];

/** Map a level-0 tag to a record type, defaulting to UNKNOWN. */
export function recordTypeFromTag(tag: string): RecordType {
  return (KNOWN_RECORD_TYPES as string[]).includes(tag)
    ? (tag as RecordType)
    : 'UNKNOWN';
}

export interface GedcomRecord {
  /** The record's xref id (without `@`s); undefined for HEAD/TRLR. */
  id?: string;
  type: RecordType;
  /** The level-0 node and its subtree. */
  root: GedcomNode;
}

/** A problem noticed while parsing (promoted to a full Issue by the validator). */
export interface ParseNote {
  lineNumber: number;
  code: 'DUPLICATE_XREF' | 'BAD_LEVEL' | 'MALFORMED_LINE' | 'ORPHAN_LINE';
  message: string;
}

export interface GedcomDatabase {
  /** All records in original file order (drives faithful serialization). */
  records: GedcomRecord[];
  /** xref id -> record (first occurrence wins on duplicates). */
  byId: Map<string, GedcomRecord>;
  /** record type -> records of that type. */
  byType: Map<RecordType, GedcomRecord[]>;
  header?: GedcomRecord;
  trailer?: GedcomRecord;
  parseNotes: ParseNote[];
  /** Dominant newline in the source, reused on export. */
  newline: '\n' | '\r\n' | '\r';
  /** Whether the source ended with a trailing newline. */
  trailingNewline: boolean;
  /** Whether the source began with a UTF-8 BOM. */
  hasBom: boolean;
}

/** Look up a record by xref id (accepts the id with or without `@`s). */
export function getRecord(
  db: GedcomDatabase,
  xref: string
): GedcomRecord | undefined {
  const id = xref.startsWith('@') && xref.endsWith('@')
    ? xref.slice(1, -1)
    : xref;
  return db.byId.get(id);
}

export function recordsOfType(
  db: GedcomDatabase,
  type: RecordType
): GedcomRecord[] {
  return db.byType.get(type) ?? [];
}
