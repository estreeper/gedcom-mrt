import { GedcomRecord } from '../model/Database';
import { GedcomNode, childrenWithTag } from '../model/Node';
import { GedcomDate, parseGedcomDate } from '../model/GedcomDate';

// Small, shared field accessors used by the semantic ("valid but wrong")
// validation rules in this folder, so each rule stays focused on its own
// check rather than re-deriving how to read GEDCOM events/relationships.

/** Child indices from the record root to `node`, by walking parent pointers.
 *  Undefined for the root itself (no parent) — callers only pass descendants. */
function pathOf(node: GedcomNode): number[] {
  const path: number[] = [];
  let cur = node;
  while (cur.parent) {
    const idx = cur.parent.children.indexOf(cur);
    path.unshift(idx);
    cur = cur.parent;
  }
  return path;
}

export interface EventInfo {
  /** The event node itself (e.g. the BIRT node). */
  node: GedcomNode;
  /** Its DATE child, if present. */
  dateNode?: GedcomNode;
  /** The parsed date, if a DATE child was present and parseable. */
  date?: GedcomDate;
  /** Path to the DATE node (or the event node itself, if there's no DATE
   *  child) — for building quickEdit fields or EditLine/RemoveNode fixes. */
  path: number[];
}

/** The first `tag` event (BIRT/DEAT/MARR/…) directly under `root`. */
export function firstEvent(root: GedcomNode, tag: string): EventInfo | undefined {
  const ev = childrenWithTag(root, tag)[0];
  if (!ev) return undefined;
  const dateNode = childrenWithTag(ev, 'DATE')[0];
  const date = dateNode ? parseGedcomDate(dateNode.line.value) : undefined;
  return { node: ev, dateNode, date, path: pathOf(dateNode ?? ev) };
}

export function birthEvent(indi: GedcomRecord): EventInfo | undefined {
  return firstEvent(indi.root, 'BIRT');
}

export function deathEvent(indi: GedcomRecord): EventInfo | undefined {
  return firstEvent(indi.root, 'DEAT');
}

export function marriageEvent(fam: GedcomRecord): EventInfo | undefined {
  return firstEvent(fam.root, 'MARR');
}

export function getSex(indi: GedcomRecord): 'M' | 'F' | undefined {
  const sex = indi.root.children.find((c) => c.line.tag === 'SEX');
  const v = sex?.line.value?.trim().toUpperCase();
  return v === 'M' || v === 'F' ? v : undefined;
}

export interface FamMembers {
  husbandId?: string;
  wifeId?: string;
  childIds: string[];
}

export function famMembers(fam: GedcomRecord): FamMembers {
  const husbandId = fam.root.children.find((c) => c.line.tag === 'HUSB')?.line
    .pointer;
  const wifeId = fam.root.children.find((c) => c.line.tag === 'WIFE')?.line
    .pointer;
  const childIds = childrenWithTag(fam.root, 'CHIL')
    .map((c) => c.line.pointer)
    .filter((x): x is string => !!x);
  return { husbandId, wifeId, childIds };
}

export function parentFamIds(indi: GedcomRecord): string[] {
  return childrenWithTag(indi.root, 'FAMC')
    .map((c) => c.line.pointer)
    .filter((x): x is string => !!x);
}

export function spouseFamIds(indi: GedcomRecord): string[] {
  return childrenWithTag(indi.root, 'FAMS')
    .map((c) => c.line.pointer)
    .filter((x): x is string => !!x);
}

/** Options threaded through the semantic rules. `now` lets future-date checks
 *  be deterministic in tests without mocking the system clock. */
export interface RuleOpts {
  now?: Date;
}

export function todayParts(opts?: RuleOpts): { year: number; month: number; day: number } {
  const d = opts?.now ?? new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}
