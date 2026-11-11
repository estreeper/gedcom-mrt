import { GedcomDatabase, recordsOfType, GedcomRecord } from '../model/Database';
import { Issue } from '../model/Issue';
import { GedcomDate, approxYearsBetween, isDefinitelyBefore } from '../model/GedcomDate';
import { nameOf, describeFamily, capitalizeFirst } from '../Describe';
import {
  birthEvent,
  marriageEvent,
  firstEvent,
  famMembers,
  spouseFamIds,
  EventInfo,
} from './accessors';

// Rules for data that's *possible but statistically improbable* — plausibly
// real, but usually a mistake. Tier: 'warning' ("Likely error"), one notch
// less certain than the logically-impossible checks in dates.ts.

const YOUNG_MARRIAGE_AGE = 12;
const YOUNG_PARENT_AGE = 13;
const OLD_MOTHER_AGE = 60;

export function relationshipRules(db: GedcomDatabase): Issue[] {
  const issues: Issue[] = [];

  for (const fam of recordsOfType(db, 'FAM')) {
    if (fam.id === undefined) continue;
    const marr = marriageEvent(fam);
    const { husbandId, wifeId, childIds } = famMembers(fam);

    // Young marriage.
    if (marr?.date) {
      for (const [spouseId, role] of [
        [husbandId, 'husband'],
        [wifeId, 'wife'],
      ] as const) {
        if (!spouseId) continue;
        const spouse = db.byId.get(spouseId);
        const birth = spouse && birthEvent(spouse);
        if (!spouse || !birth?.date) continue;
        const age = approxYearsBetween(birth.date, marr.date);
        if (age !== undefined && age >= 0 && age < YOUNG_MARRIAGE_AGE) {
          issues.push({
            id: `YOUNG_MARRIAGE:${fam.id}:${spouseId}`,
            category: 'YOUNG_MARRIAGE',
            severity: 'warning',
            message: `@${spouseId}@ (${role}) was about ${age} years old at the marriage recorded in @${fam.id}@.`,
            humanMessage: capitalizeFirst(
              `${nameOf(db, spouseId)} was about ${age} years old when ${describeFamily(db, fam.id)} was married — worth double-checking.`
            ),
            recordIds: [fam.id, spouseId],
            lineNumbers: [marr.dateNode?.line.lineNumber ?? marr.node.line.lineNumber],
            suggestedFixes: [],
            quickEdit: [
              {
                recordId: spouse.id!,
                path: birth.path,
                label: 'Birth date',
                value: birth.dateNode?.line.value ?? '',
                allowClear: true,
              },
              {
                recordId: fam.id,
                path: marr.path,
                label: 'Marriage date',
                value: marr.dateNode?.line.value ?? '',
                allowClear: true,
              },
            ],
          });
        }
      }
    }

    // Implausible parent age (too young, or an implausibly old mother).
    for (const [parentId, role] of [
      [husbandId, 'father'],
      [wifeId, 'mother'],
    ] as const) {
      if (!parentId) continue;
      const parent = db.byId.get(parentId);
      const parentBirth = parent && birthEvent(parent);
      if (!parent || !parentBirth?.date) continue;

      for (const childId of childIds) {
        const child = db.byId.get(childId);
        const childBirth = child && birthEvent(child);
        if (!child || !childBirth?.date) continue;
        const age = approxYearsBetween(parentBirth.date, childBirth.date);
        if (age === undefined || age < 0) continue; // guaranteed-impossible case is dates.ts's job

        const tooYoung = age < YOUNG_PARENT_AGE;
        const tooOld = role === 'mother' && age > OLD_MOTHER_AGE;
        if (!tooYoung && !tooOld) continue;

        issues.push({
          id: `IMPLAUSIBLE_PARENT_AGE:${parentId}:${childId}`,
          category: 'IMPLAUSIBLE_PARENT_AGE',
          severity: 'warning',
          message: `@${parentId}@ (${role}) was about ${age} years old when @${childId}@ was born.`,
          humanMessage: capitalizeFirst(
            `${nameOf(db, parentId)} was about ${age} years old when ${nameOf(db, childId)} was born — worth double-checking.`
          ),
          recordIds: [parentId, childId],
          lineNumbers: [
            parentBirth.dateNode?.line.lineNumber ?? parentBirth.node.line.lineNumber,
          ],
          suggestedFixes: [],
          quickEdit: [
            {
              recordId: parent.id!,
              path: parentBirth.path,
              label: `${capitalizeFirst(role)}'s birth date`,
              value: parentBirth.dateNode?.line.value ?? '',
              allowClear: true,
            },
            {
              recordId: child.id!,
              path: childBirth.path,
              label: "Child's birth date",
              value: childBirth.dateNode?.line.value ?? '',
              allowClear: true,
            },
          ],
        });
      }
    }
  }

  issues.push(...pluralMarriages(db));

  return issues;
}

/** The date a marriage effectively ended: its DIV date if present, else the
 *  death date of the *other* spouse. Undefined means (as far as the file
 *  records) the marriage was never ended — divorced/widowed status unknown. */
function marriageEndDate(
  db: GedcomDatabase,
  fam: GedcomRecord,
  individualId: string
): GedcomDate | undefined {
  const div = firstEvent(fam.root, 'DIV');
  if (div?.date) return div.date;

  const { husbandId, wifeId } = famMembers(fam);
  const otherId = husbandId === individualId ? wifeId : husbandId;
  const other = otherId ? db.byId.get(otherId) : undefined;
  if (!other) return undefined;
  return firstEvent(other.root, 'DEAT')?.date;
}

/** Flag when an individual appears to have been married to two spouses at
 *  once — i.e. a later marriage's date isn't definitely after the previous
 *  marriage's known end (divorce, or the other spouse's death). Sequential
 *  remarriage after a recorded divorce/widowhood is common and NOT flagged. */
function pluralMarriages(db: GedcomDatabase): Issue[] {
  const issues: Issue[] = [];

  for (const indi of recordsOfType(db, 'INDI')) {
    if (indi.id === undefined) continue;
    // A damaged file can list the same FAMS twice; one family is one marriage.
    const famIds = Array.from(new Set(spouseFamIds(indi)));
    if (famIds.length < 2) continue;

    const dated: Array<{ fam: GedcomRecord; marr: EventInfo }> = famIds
      .map((id) => db.byId.get(id))
      .filter((f): f is GedcomRecord => !!f)
      .flatMap((fam) => {
        const marr = marriageEvent(fam);
        return marr?.date ? [{ fam, marr }] : [];
      })
      .sort((a, b) => (a.marr.date!.year ?? 0) - (b.marr.date!.year ?? 0));

    for (let i = 0; i < dated.length - 1; i++) {
      const early = dated[i];
      const later = dated[i + 1];
      const endDate = marriageEndDate(db, early.fam, indi.id);
      if (endDate && isDefinitelyBefore(endDate, later.marr.date!)) continue; // properly ended first

      issues.push({
        id: `PLURAL_MARRIAGE:${indi.id}:${early.fam.id}:${later.fam.id}`,
        category: 'PLURAL_MARRIAGE',
        severity: 'warning',
        message: `@${indi.id}@ appears to be married in both @${early.fam.id}@ and @${later.fam.id}@ at overlapping times.`,
        humanMessage: capitalizeFirst(
          `${nameOf(db, indi.id)} appears to have been married in ${describeFamily(db, early.fam.id)} and ${describeFamily(db, later.fam.id)} at the same time, with no recorded divorce or death in between.`
        ),
        recordIds: [indi.id, early.fam.id!, later.fam.id!],
        lineNumbers: [
          early.marr.dateNode?.line.lineNumber ?? early.marr.node.line.lineNumber,
        ],
        suggestedFixes: [],
      });
    }
  }

  return issues;
}
