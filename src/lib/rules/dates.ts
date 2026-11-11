import { GedcomDatabase, recordsOfType, GedcomRecord } from '../model/Database';
import { Issue, QuickEditField, Severity } from '../model/Issue';
import {
  isDefinitelyAfter,
  isDefinitelyBefore,
  isDefinitelyAfterToday,
  approxYearsBetween,
  GedcomDate,
} from '../model/GedcomDate';
import { nameOf, describeFamily, capitalizeFirst } from '../Describe';
import {
  birthEvent,
  deathEvent,
  marriageEvent,
  firstEvent,
  famMembers,
  RuleOpts,
  todayParts,
  EventInfo,
} from './accessors';

// Rules for dates that are logically impossible — nothing here can ever be
// correct, regardless of who entered it, so these default to the 'error' tier.
// When one of the dates involved is only an estimate (ABT/EST/CAL), the
// impossibility is itself uncertain, so the issue is downgraded to 'warning'.
// All of these are flag-only (no safe automatic fix — we never delete a
// genealogical date on the user's behalf); each carries a `quickEdit` so the
// offending value can be corrected inline.

const MAX_PLAUSIBLE_LIFESPAN_YEARS = 123; // oldest verified human on record: 122

function severityFor(...dates: Array<GedcomDate | undefined>): Severity {
  return dates.some((d) => d?.approximate) ? 'warning' : 'error';
}

function quickEditFor(rec: GedcomRecord, ev: EventInfo, label: string): QuickEditField {
  return {
    recordId: rec.id!,
    path: ev.path,
    label,
    value: ev.dateNode?.line.value ?? '',
    allowClear: true,
  };
}

export function dateRules(db: GedcomDatabase, opts: RuleOpts = {}): Issue[] {
  const issues: Issue[] = [];
  const today = todayParts(opts);

  for (const indi of recordsOfType(db, 'INDI')) {
    if (indi.id === undefined) continue;
    const birth = birthEvent(indi);
    const death = deathEvent(indi);

    // Death before birth.
    if (birth?.date && death?.date && isDefinitelyAfter(birth.date, death.date)) {
      issues.push({
        id: `DEATH_BEFORE_BIRTH:${indi.id}`,
        category: 'DEATH_BEFORE_BIRTH',
        severity: severityFor(birth.date, death.date),
        message: `@${indi.id}@ has a death date before its birth date.`,
        humanMessage: capitalizeFirst(
          `${nameOf(db, indi.id)}'s death date is recorded before their birth date.`
        ),
        recordIds: [indi.id],
        lineNumbers: [death.dateNode?.line.lineNumber ?? death.node.line.lineNumber],
        suggestedFixes: [],
        quickEdit: [
          quickEditFor(indi, birth, 'Birth date'),
          quickEditFor(indi, death, 'Death date'),
        ],
      });
    }

    // Future birth/death dates.
    for (const [event, label] of [
      [birth, 'birth'],
      [death, 'death'],
    ] as const) {
      if (event?.date && isDefinitelyAfterToday(event.date, today)) {
        issues.push({
          id: `FUTURE_DATE:${indi.id}:${label.toUpperCase()}`,
          category: 'FUTURE_DATE',
          severity: 'error',
          message: `@${indi.id}@ has a ${label} date in the future.`,
          humanMessage: capitalizeFirst(
            `${nameOf(db, indi.id)}'s ${label} date is in the future.`
          ),
          recordIds: [indi.id],
          lineNumbers: [event.dateNode?.line.lineNumber ?? event.node.line.lineNumber],
          suggestedFixes: [],
          quickEdit: [quickEditFor(indi, event, capitalizeFirst(`${label} date`))],
        });
      }
    }

    // Unrealistic lifespan. Only meaningful when the dates pin the lifespan
    // from below: a birth known only as "after x", or a death only as "before
    // y", says nothing about how long the person lived at minimum. A birth
    // range is measured from its later end for the same reason.
    const lifespanKnown =
      birth?.date && death?.date && birth.date.bound !== 'after' && death.date.bound !== 'before';
    if (birth?.date && death?.date && lifespanKnown) {
      const years = approxYearsBetween(birth.date.rangeTo ?? birth.date, death.date);
      if (years !== undefined && years > MAX_PLAUSIBLE_LIFESPAN_YEARS) {
        issues.push({
          id: `UNREALISTIC_LIFESPAN:${indi.id}`,
          category: 'UNREALISTIC_LIFESPAN',
          severity: severityFor(birth.date, death.date),
          message: `@${indi.id}@ would have been about ${years} years old — beyond any verified human lifespan.`,
          humanMessage: capitalizeFirst(
            `${nameOf(db, indi.id)} would have been about ${years} years old, which is beyond any verified human lifespan.`
          ),
          recordIds: [indi.id],
          lineNumbers: [death.dateNode?.line.lineNumber ?? death.node.line.lineNumber],
          suggestedFixes: [],
          quickEdit: [
            quickEditFor(indi, birth, 'Birth date'),
            quickEditFor(indi, death, 'Death date'),
          ],
        });
      }
    }

    // Baptism/christening before birth.
    for (const tag of ['BAPM', 'CHR']) {
      const ev = firstEvent(indi.root, tag);
      if (birth?.date && ev?.date && isDefinitelyBefore(ev.date, birth.date)) {
        issues.push({
          id: `EVENT_ORDER_IMPOSSIBLE:${indi.id}:${tag}`,
          category: 'EVENT_ORDER_IMPOSSIBLE',
          severity: severityFor(birth.date, ev.date),
          message: `@${indi.id}@ has a ${tag} date before its birth date.`,
          humanMessage: capitalizeFirst(
            `${nameOf(db, indi.id)}'s ${tag === 'BAPM' ? 'baptism' : 'christening'} is recorded before their birth.`
          ),
          recordIds: [indi.id],
          lineNumbers: [ev.dateNode?.line.lineNumber ?? ev.node.line.lineNumber],
          suggestedFixes: [],
          quickEdit: [
            quickEditFor(indi, birth, 'Birth date'),
            quickEditFor(indi, ev, capitalizeFirst(`${tag === 'BAPM' ? 'baptism' : 'christening'} date`)),
          ],
        });
      }
    }

    // Burial/cremation before death.
    for (const tag of ['BURI', 'CREM']) {
      const ev = firstEvent(indi.root, tag);
      if (death?.date && ev?.date && isDefinitelyBefore(ev.date, death.date)) {
        issues.push({
          id: `EVENT_ORDER_IMPOSSIBLE:${indi.id}:${tag}`,
          category: 'EVENT_ORDER_IMPOSSIBLE',
          severity: severityFor(death.date, ev.date),
          message: `@${indi.id}@ has a ${tag} date before its death date.`,
          humanMessage: capitalizeFirst(
            `${nameOf(db, indi.id)}'s ${tag === 'BURI' ? 'burial' : 'cremation'} is recorded before their death.`
          ),
          recordIds: [indi.id],
          lineNumbers: [ev.dateNode?.line.lineNumber ?? ev.node.line.lineNumber],
          suggestedFixes: [],
          quickEdit: [
            quickEditFor(indi, death, 'Death date'),
            quickEditFor(indi, ev, capitalizeFirst(`${tag === 'BURI' ? 'burial' : 'cremation'} date`)),
          ],
        });
      }
    }
  }

  for (const fam of recordsOfType(db, 'FAM')) {
    if (fam.id === undefined) continue;
    const marr = marriageEvent(fam);
    if (!marr?.date) continue;
    const { husbandId, wifeId } = famMembers(fam);

    for (const [spouseId, role] of [
      [husbandId, 'husband'],
      [wifeId, 'wife'],
    ] as const) {
      if (!spouseId) continue;
      const spouse = db.byId.get(spouseId);
      if (!spouse) continue;
      const sBirth = birthEvent(spouse);
      const sDeath = deathEvent(spouse);

      if (sBirth?.date && isDefinitelyBefore(marr.date, sBirth.date)) {
        issues.push({
          id: `MARRIAGE_BEFORE_BIRTH:${fam.id}:${spouseId}`,
          category: 'MARRIAGE_BEFORE_BIRTH',
          severity: severityFor(marr.date, sBirth.date),
          message: `@${fam.id}@ has a marriage date before ${role} @${spouseId}@'s birth date.`,
          humanMessage: capitalizeFirst(
            `${describeFamily(db, fam.id)} has a marriage date before ${nameOf(db, spouseId)}'s birth.`
          ),
          recordIds: [fam.id, spouseId],
          lineNumbers: [marr.dateNode?.line.lineNumber ?? marr.node.line.lineNumber],
          suggestedFixes: [],
          quickEdit: [
            quickEditFor(fam, marr, 'Marriage date'),
            quickEditFor(spouse, sBirth, 'Birth date'),
          ],
        });
      }

      if (sDeath?.date && isDefinitelyAfter(marr.date, sDeath.date)) {
        issues.push({
          id: `MARRIAGE_AFTER_DEATH:${fam.id}:${spouseId}`,
          category: 'MARRIAGE_AFTER_DEATH',
          severity: severityFor(marr.date, sDeath.date),
          message: `@${fam.id}@ has a marriage date after ${role} @${spouseId}@'s death date.`,
          humanMessage: capitalizeFirst(
            `${describeFamily(db, fam.id)} has a marriage date after ${nameOf(db, spouseId)}'s death.`
          ),
          recordIds: [fam.id, spouseId],
          lineNumbers: [marr.dateNode?.line.lineNumber ?? marr.node.line.lineNumber],
          suggestedFixes: [],
          quickEdit: [
            quickEditFor(fam, marr, 'Marriage date'),
            quickEditFor(spouse, sDeath, 'Death date'),
          ],
        });
      }
    }

    // Future marriage date.
    if (isDefinitelyAfterToday(marr.date, today)) {
      issues.push({
        id: `FUTURE_DATE:${fam.id}:MARR`,
        category: 'FUTURE_DATE',
        severity: 'error',
        message: `@${fam.id}@ has a marriage date in the future.`,
        humanMessage: capitalizeFirst(
          `${describeFamily(db, fam.id)} has a marriage date in the future.`
        ),
        recordIds: [fam.id],
        lineNumbers: [marr.dateNode?.line.lineNumber ?? marr.node.line.lineNumber],
        suggestedFixes: [],
        quickEdit: [quickEditFor(fam, marr, 'Marriage date')],
      });
    }
  }

  // Parent born after child.
  for (const fam of recordsOfType(db, 'FAM')) {
    if (fam.id === undefined) continue;
    const { husbandId, wifeId, childIds } = famMembers(fam);
    for (const parentId of [husbandId, wifeId].filter((x): x is string => !!x)) {
      const parent = db.byId.get(parentId);
      const parentBirth = parent && birthEvent(parent);
      if (!parent || !parentBirth?.date) continue;

      for (const childId of childIds) {
        const child = db.byId.get(childId);
        const childBirth = child && birthEvent(child);
        if (!child || !childBirth?.date) continue;
        if (!isDefinitelyAfter(parentBirth.date, childBirth.date)) continue;

        issues.push({
          id: `PARENT_BORN_AFTER_CHILD:${parentId}:${childId}`,
          category: 'PARENT_BORN_AFTER_CHILD',
          severity: severityFor(parentBirth.date, childBirth.date),
          message: `@${parentId}@ is recorded as @${childId}@'s parent but was born after @${childId}@.`,
          humanMessage: capitalizeFirst(
            `${nameOf(db, parentId)} is recorded as ${nameOf(db, childId)}'s parent, but was born after ${nameOf(db, childId)}.`
          ),
          recordIds: [parentId, childId],
          lineNumbers: [
            parentBirth.dateNode?.line.lineNumber ?? parentBirth.node.line.lineNumber,
          ],
          suggestedFixes: [],
          quickEdit: [
            quickEditFor(parent, parentBirth, 'Birth date'),
            quickEditFor(child, childBirth, "Child's birth date"),
          ],
        });
      }
    }
  }

  return issues;
}
