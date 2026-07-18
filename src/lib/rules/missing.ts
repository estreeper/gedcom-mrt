import { GedcomDatabase, GedcomRecord, recordsOfType } from '../model/Database';
import { GedcomNode, walk } from '../model/Node';
import { Issue } from '../model/Issue';
import { nameOf, describeFamily, capitalizeFirst } from '../Describe';
import { famMembers } from './accessors';

// Rules for incomplete or suspect data that is nonetheless often legitimate —
// tier 'info' ("Possible issue"). These are flag-only: there's no value to
// quick-edit (nothing was recorded), so the escape hatch is the full manual
// editor via the issue's recordIds.

function hasEvent(rec: GedcomRecord, tag: string): boolean {
  return rec.root.children.some((c) => c.line.tag === tag);
}

function hasAnySource(root: GedcomNode): boolean {
  let found = false;
  walk(root, (n) => {
    if (n.line.tag === 'SOUR') found = true;
  });
  return found;
}

export function missingDataRules(db: GedcomDatabase): Issue[] {
  const issues: Issue[] = [];

  for (const indi of recordsOfType(db, 'INDI')) {
    if (indi.id === undefined) continue;

    if (!hasEvent(indi, 'BIRT') && !hasEvent(indi, 'DEAT')) {
      issues.push({
        id: `MISSING_LIFE_DATES:${indi.id}`,
        category: 'MISSING_LIFE_DATES',
        severity: 'info',
        message: `@${indi.id}@ has no birth or death information.`,
        humanMessage: capitalizeFirst(
          `${nameOf(db, indi.id)} has no recorded birth or death information.`
        ),
        recordIds: [indi.id],
        lineNumbers: [indi.root.line.lineNumber],
        suggestedFixes: [],
      });
    }

    if (!hasAnySource(indi.root)) {
      issues.push({
        id: `MISSING_SOURCES:${indi.id}`,
        category: 'MISSING_SOURCES',
        severity: 'info',
        message: `@${indi.id}@ has no source citations.`,
        humanMessage: capitalizeFirst(
          `${nameOf(db, indi.id)} has no source citations backing up their record.`
        ),
        recordIds: [indi.id],
        lineNumbers: [indi.root.line.lineNumber],
        suggestedFixes: [],
      });
    }
  }

  for (const fam of recordsOfType(db, 'FAM')) {
    if (fam.id === undefined) continue;
    const { childIds } = famMembers(fam);
    if (childIds.length === 0) {
      issues.push({
        id: `CHILDLESS_FAMILY:${fam.id}`,
        category: 'CHILDLESS_FAMILY',
        severity: 'info',
        message: `@${fam.id}@ has no children recorded.`,
        humanMessage: capitalizeFirst(`${describeFamily(db, fam.id)} has no children recorded.`),
        recordIds: [fam.id],
        lineNumbers: [fam.root.line.lineNumber],
        suggestedFixes: [],
      });
    }
  }

  return issues;
}
