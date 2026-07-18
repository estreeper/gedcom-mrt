import { GedcomDatabase, GedcomRecord, recordsOfType } from '../model/Database';
import { Issue } from '../model/Issue';
import { nameOf, describeFamily, individualName, capitalizeFirst } from '../Describe';
import { famMembers, parentFamIds, spouseFamIds, birthEvent, deathEvent } from './accessors';

// Structural rules that don't fit the date-comparison shape of dates.ts:
// self-referential and circular relationships (tier 'error' — logically
// impossible, like a graph that isn't a valid family tree), and duplicate /
// unlinked individuals (tier 'info' — worth a look, often legitimate).

export function structuralRules(db: GedcomDatabase): Issue[] {
  return [
    ...selfReferentialRelations(db),
    ...circularAncestry(db),
    ...duplicateIndividuals(db),
    ...orphanIndividuals(db),
  ];
}

function parentsOf(db: GedcomDatabase, id: string): string[] {
  const indi = db.byId.get(id);
  if (!indi) return [];
  const parents: string[] = [];
  for (const famId of parentFamIds(indi)) {
    const fam = db.byId.get(famId);
    if (!fam) continue;
    const { husbandId, wifeId } = famMembers(fam);
    if (husbandId) parents.push(husbandId);
    if (wifeId) parents.push(wifeId);
  }
  return parents;
}

// --- self-referential: a one-hop degenerate case, flagged separately from
// longer circular-ancestry chains so the message is simpler and more direct.

function selfReferentialRelations(db: GedcomDatabase): Issue[] {
  const issues: Issue[] = [];

  for (const fam of recordsOfType(db, 'FAM')) {
    if (fam.id === undefined) continue;
    const { husbandId, wifeId } = famMembers(fam);
    if (husbandId && wifeId && husbandId === wifeId) {
      issues.push({
        id: `SELF_REFERENTIAL_RELATION:${fam.id}:SPOUSE`,
        category: 'SELF_REFERENTIAL_RELATION',
        severity: 'error',
        message: `@${fam.id}@ lists @${husbandId}@ as both HUSB and WIFE.`,
        humanMessage: capitalizeFirst(
          `${nameOf(db, husbandId)} is listed as both spouses in ${describeFamily(db, fam.id)}.`
        ),
        recordIds: [fam.id, husbandId],
        lineNumbers: [fam.root.line.lineNumber],
        suggestedFixes: [],
      });
    }
  }

  for (const indi of recordsOfType(db, 'INDI')) {
    if (indi.id === undefined) continue;
    if (parentsOf(db, indi.id).includes(indi.id)) {
      issues.push({
        id: `SELF_REFERENTIAL_RELATION:${indi.id}:PARENT`,
        category: 'SELF_REFERENTIAL_RELATION',
        severity: 'error',
        message: `@${indi.id}@ is listed as their own parent.`,
        humanMessage: capitalizeFirst(`${nameOf(db, indi.id)} is listed as their own parent.`),
        recordIds: [indi.id],
        lineNumbers: [indi.root.line.lineNumber],
        suggestedFixes: [],
      });
    }
  }

  return issues;
}

// --- circular ancestry: standard DFS cycle detection over the child->parent
// graph (FAMC -> family's HUSB/WIFE). Each individual is visited once overall
// (O(V+E)); a cycle is reported the first time it's discovered.

function makeCycleIssue(db: GedcomDatabase, cycle: string[]): Issue {
  const unique = Array.from(new Set(cycle));
  const names = unique.map((pid) => nameOf(db, pid));
  return {
    id: `CIRCULAR_ANCESTRY:${[...unique].sort().join(',')}`,
    category: 'CIRCULAR_ANCESTRY',
    severity: 'error',
    message: `Circular ancestry detected among: ${unique.map((x) => `@${x}@`).join(', ')}.`,
    humanMessage: capitalizeFirst(
      `${names.join(', ')} form a circular ancestry — someone in this chain is listed as their own ancestor.`
    ),
    recordIds: unique,
    lineNumbers: [],
    suggestedFixes: [],
  };
}

function circularAncestry(db: GedcomDatabase): Issue[] {
  const issues: Issue[] = [];
  const state = new Map<string, 0 | 1 | 2>();

  function dfs(id: string, stack: string[]): void {
    state.set(id, 1);
    stack.push(id);
    for (const p of parentsOf(db, id)) {
      if (p === id) continue; // one-hop self-loop: selfReferentialRelations' job
      const s = state.get(p) ?? 0;
      if (s === 0) {
        dfs(p, stack);
      } else if (s === 1) {
        const idx = stack.indexOf(p);
        issues.push(makeCycleIssue(db, stack.slice(idx)));
      }
    }
    stack.pop();
    state.set(id, 2);
  }

  for (const indi of recordsOfType(db, 'INDI')) {
    if (indi.id === undefined) continue;
    if ((state.get(indi.id) ?? 0) === 0) dfs(indi.id, []);
  }

  return issues;
}

// --- duplicate individuals: same normalized name, and a matching birth year
// (falling back to a matching death year when birth years aren't available).
// Requires at least one matching year — same name alone is too common to flag.

function normalizeName(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let out = '';
  let lastWasSpace = false;
  for (const ch of raw) {
    if (ch === '/') continue;
    const isSpace = ch === ' ' || ch === '\t';
    if (isSpace) {
      if (!lastWasSpace && out.length > 0) out += ' ';
      lastWasSpace = true;
    } else {
      out += ch.toUpperCase();
      lastWasSpace = false;
    }
  }
  return out.trim() || undefined;
}

function duplicateIndividuals(db: GedcomDatabase): Issue[] {
  const issues: Issue[] = [];
  const byName = new Map<string, GedcomRecord[]>();

  for (const indi of recordsOfType(db, 'INDI')) {
    if (indi.id === undefined) continue;
    const name = normalizeName(individualName(indi));
    if (!name) continue;
    const list = byName.get(name);
    if (list) list.push(indi);
    else byName.set(name, [indi]);
  }

  for (const group of byName.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        const aBirth = birthEvent(a)?.date?.year;
        const bBirth = birthEvent(b)?.date?.year;
        const aDeath = deathEvent(a)?.date?.year;
        const bDeath = deathEvent(b)?.date?.year;
        const matches =
          (aBirth !== undefined && aBirth === bBirth) ||
          (aBirth === undefined &&
            bBirth === undefined &&
            aDeath !== undefined &&
            aDeath === bDeath);
        if (!matches) continue;

        issues.push({
          id: `DUPLICATE_INDIVIDUAL:${[a.id, b.id].sort().join(':')}`,
          category: 'DUPLICATE_INDIVIDUAL',
          severity: 'info',
          message: `@${a.id}@ and @${b.id}@ share a name and birth/death year — possibly the same person entered twice.`,
          humanMessage: capitalizeFirst(
            `${nameOf(db, a.id)} appears to be entered twice, with a matching name and year.`
          ),
          recordIds: [a.id!, b.id!],
          lineNumbers: [],
          suggestedFixes: [],
        });
      }
    }
  }

  return issues;
}

// --- orphan / unlinked individuals: no FAMC/FAMS of their own, AND no FAM
// references them either. An individual referenced by a FAM's HUSB/WIFE/CHIL
// but missing their own back-pointer is a one-way link — ASYMMETRIC_LINK's
// job, not a genuine orphan — so both directions are checked here.

function orphanIndividuals(db: GedcomDatabase): Issue[] {
  const issues: Issue[] = [];

  const referencedByFamily = new Set<string>();
  for (const fam of recordsOfType(db, 'FAM')) {
    const { husbandId, wifeId, childIds } = famMembers(fam);
    if (husbandId) referencedByFamily.add(husbandId);
    if (wifeId) referencedByFamily.add(wifeId);
    for (const c of childIds) referencedByFamily.add(c);
  }

  for (const indi of recordsOfType(db, 'INDI')) {
    if (indi.id === undefined) continue;
    const linkedFromSelf = parentFamIds(indi).length > 0 || spouseFamIds(indi).length > 0;
    if (!linkedFromSelf && !referencedByFamily.has(indi.id)) {
      issues.push({
        id: `ORPHAN_INDI:${indi.id}`,
        category: 'ORPHAN_INDI',
        severity: 'info',
        message: `@${indi.id}@ is not linked to any family.`,
        humanMessage: capitalizeFirst(
          `${nameOf(db, indi.id)} is not linked to any family in this file.`
        ),
        recordIds: [indi.id],
        lineNumbers: [indi.root.line.lineNumber],
        suggestedFixes: [],
      });
    }
  }
  return issues;
}
