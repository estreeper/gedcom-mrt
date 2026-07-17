import { GedcomDatabase, GedcomRecord } from './model/Database';

// Turn record ids into human-readable descriptions for friendly messages and
// UI labels. Names come straight from the GEDCOM NAME value (slashes around the
// surname preserved, as authored), falling back to the @xref@ id.

/** The NAME value of an individual record, or undefined. */
export function individualName(rec: GedcomRecord | undefined): string | undefined {
  if (!rec) return undefined;
  const name = rec.root.children.find((c) => c.line.tag === 'NAME');
  const v = name?.line.value?.trim();
  return v ? v : undefined;
}

/** A friendly label for an individual by id: their name, else @id@. */
export function nameOf(db: GedcomDatabase, id: string | undefined): string {
  if (!id) return 'an unknown person';
  return individualName(db.byId.get(id)) ?? `@${id}@`;
}

/** A friendly description of a family by id, using spouse names when known. */
export function describeFamily(
  db: GedcomDatabase,
  id: string | undefined
): string {
  const fam = id ? db.byId.get(id) : undefined;
  if (!fam) return 'a family';
  const husb = fam.root.children.find((c) => c.line.tag === 'HUSB')?.line.pointer;
  const wife = fam.root.children.find((c) => c.line.tag === 'WIFE')?.line.pointer;
  const names = [husb, wife]
    .filter((x): x is string => !!x)
    .map((pid) => individualName(db.byId.get(pid)) ?? `@${pid}@`);
  if (names.length === 2) return `the family of ${names[0]} and ${names[1]}`;
  if (names.length === 1) return `the family of ${names[0]}`;
  return 'a family';
}

/** Friendly description of any record: person name, family desc, or @id@. */
export function describeRecord(
  db: GedcomDatabase,
  id: string | undefined
): string {
  if (!id) return 'a record';
  const rec = db.byId.get(id);
  if (!rec) return `@${id}@`;
  if (rec.type === 'INDI') return individualName(rec) ?? `@${id}@`;
  if (rec.type === 'FAM') return describeFamily(db, id);
  return `@${id}@`;
}

/** Capitalize the first character of a sentence. */
export function capitalizeFirst(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}
