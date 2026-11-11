import {
  GedcomDatabase,
  GedcomRecord,
  RecordType,
  recordsOfType,
} from './model/Database';
import { GedcomNode } from './model/Node';
import { Issue, SuggestedFix } from './model/Issue';
import { Fix, makeLine, makeNode, makeStubRecord } from './model/Fix';
import {
  nameOf,
  describeFamily,
  describeRecord,
  capitalizeFirst,
} from './Describe';
import { parseNoteRules } from './rules/parseNotes';
import { dateRules } from './rules/dates';
import { relationshipRules } from './rules/relationships';
import { missingDataRules } from './rules/missing';
import { structuralRules } from './rules/structural';
import { RuleOpts, getSex } from './rules/accessors';

// The validation engine. `validate` runs each rule and concatenates the
// issues. Rules never mutate the database.
//
// `danglingPointers` and `asymmetricLinks` below are structural — a broken
// pointer or a one-way link is the fingerprint of a corrupted export/edit,
// not something a person would type on purpose — so they sit at the top
// 'invalid' tier alongside parseNoteRules. The rules/ folder holds the
// semantic ("valid GEDCOM, but the data is wrong") checks, tiered by how
// certain we are (see Severity in model/Issue.ts).
export function validate(db: GedcomDatabase, opts: RuleOpts = {}): Issue[] {
  const all = [
    ...parseNoteRules(db),
    ...danglingPointers(db),
    ...asymmetricLinks(db),
    ...dateRules(db, opts),
    ...relationshipRules(db),
    ...missingDataRules(db),
    ...structuralRules(db),
  ];
  // Issue ids are the UI's identity for an issue (selection, list keys, the
  // resolved list), so they must be unique. Damaged files can state the same
  // fact twice (a FAM listing one CHIL on two lines), which yields the same
  // finding twice; report it once.
  const seen = new Set<string>();
  return all.filter((issue) => {
    if (seen.has(issue.id)) return false;
    seen.add(issue.id);
    return true;
  });
}

// --- helpers ---------------------------------------------------------------

/** Visit every node in a record, yielding the child-index path from the root. */
function eachNode(
  root: GedcomNode,
  cb: (node: GedcomNode, path: number[]) => void,
  path: number[] = []
): void {
  cb(root, path);
  root.children.forEach((child, i) => eachNode(child, cb, [...path, i]));
}

/** Does a record have a direct child with this tag pointing at targetId? */
function hasPointerChild(
  rec: GedcomRecord,
  tag: string,
  targetId: string | undefined
): boolean {
  if (targetId === undefined) return false;
  return rec.root.children.some(
    (c) => c.line.tag === tag && c.line.pointer === targetId
  );
}

function indexBeforeTrailer(db: GedcomDatabase): number {
  const i = db.records.findIndex((r) => r.type === 'TRLR');
  return i < 0 ? db.records.length : i;
}

// Pointer tag -> a human word for what the missing target is.
const KIND_BY_TAG: Record<string, string> = {
  FAMC: 'family',
  FAMS: 'family',
  HUSB: 'person',
  WIFE: 'person',
  CHIL: 'person',
  SOUR: 'source',
  NOTE: 'note',
  OBJE: 'media object',
  REPO: 'repository',
  SUBM: 'submitter',
};

// Pointer tag -> the record type a missing target should be stubbed as.
const STUB_TYPE_BY_TAG: Record<string, RecordType> = {
  FAMC: 'FAM',
  FAMS: 'FAM',
  HUSB: 'INDI',
  WIFE: 'INDI',
  CHIL: 'INDI',
  SUBM: 'SUBM',
  REPO: 'REPO',
  SOUR: 'SOUR',
  NOTE: 'NOTE',
  OBJE: 'OBJE',
};

// --- rule: dangling pointers ----------------------------------------------

function danglingPointers(db: GedcomDatabase): Issue[] {
  const issues: Issue[] = [];

  for (const rec of db.records) {
    eachNode(rec.root, (node, path) => {
      const { tag, pointer, lineNumber } = node.line;
      if (!pointer || db.byId.has(pointer)) return;

      const kind = KIND_BY_TAG[tag] ?? 'record';
      const subject = describeRecord(db, rec.id);

      const fixes: SuggestedFix[] = [];
      if (rec.id !== undefined) {
        fixes.push({
          label: `Remove the ${tag} @${pointer}@ line`,
          humanLabel: `Remove ${subject}'s reference to the missing ${kind}.`,
          fix: { kind: 'RemoveNode', target: { recordId: rec.id, path } },
        });
      }
      const stubType = STUB_TYPE_BY_TAG[tag];
      if (stubType) {
        fixes.push({
          label: `Create a stub ${stubType} record @${pointer}@`,
          humanLabel: `Create a placeholder ${kind} record so the reference resolves.`,
          fix: {
            kind: 'AddRecord',
            index: indexBeforeTrailer(db),
            record: makeStubRecord(pointer, stubType),
          },
        });
      }
      issues.push({
        id: `DANGLING_POINTER:${rec.id ?? '?'}:${tag}:${pointer}:${lineNumber}`,
        category: 'DANGLING_POINTER',
        severity: 'invalid',
        message: `${rec.id ? '@' + rec.id + '@' : 'A record'} points to @${pointer}@ via ${tag}, but no such record exists.`,
        humanMessage: capitalizeFirst(
          `${describeRecord(db, rec.id)} refers to a ${kind} that is missing from the file.`
        ),
        recordIds: rec.id ? [rec.id] : [],
        lineNumbers: [lineNumber],
        suggestedFixes: fixes,
      });
    });
  }

  return issues;
}

// --- rule: asymmetric (one-way) family links ------------------------------

function addPointerFix(
  targetRecord: GedcomRecord,
  tag: string,
  pointerId: string,
  label: string,
  humanLabel: string
): SuggestedFix {
  const fix: Fix = {
    kind: 'AddNode',
    parent: { recordId: targetRecord.id!, path: [] },
    index: targetRecord.root.children.length,
    node: makeNode(makeLine(1, tag, { pointer: pointerId })),
  };
  return { label, humanLabel, fix };
}

function asymmetricLinks(db: GedcomDatabase): Issue[] {
  const issues: Issue[] = [];

  // FAM -> INDI: HUSB/WIFE expect FAMS back; CHIL expects FAMC back.
  for (const fam of recordsOfType(db, 'FAM')) {
    if (fam.id === undefined) continue;
    for (const child of fam.root.children) {
      const { tag, pointer, lineNumber } = child.line;
      if (!pointer) continue;
      if (tag !== 'HUSB' && tag !== 'WIFE' && tag !== 'CHIL') continue;
      const indi = db.byId.get(pointer);
      if (!indi || indi.id === undefined) continue; // missing target = dangling

      const needTag = tag === 'CHIL' ? 'FAMC' : 'FAMS';
      if (hasPointerChild(indi, needTag, fam.id)) continue;

      const role = tag === 'CHIL' ? 'a child' : 'a spouse';
      issues.push({
        id: `ASYMMETRIC_LINK:${indi.id}:${needTag}:${fam.id}`,
        category: 'ASYMMETRIC_LINK',
        severity: 'invalid',
        message: `@${fam.id}@ lists ${tag} @${indi.id}@, but @${indi.id}@ has no ${needTag} back to @${fam.id}@.`,
        humanMessage: capitalizeFirst(
          `${describeFamily(db, fam.id)} lists ${nameOf(db, indi.id)} as ${role}, but ${nameOf(db, indi.id)}'s record doesn't link back to that family.`
        ),
        recordIds: [fam.id, indi.id],
        lineNumbers: [lineNumber],
        suggestedFixes: [
          addPointerFix(
            indi,
            needTag,
            fam.id,
            `Add ${needTag} @${fam.id}@ to @${indi.id}@`,
            `Link ${nameOf(db, indi.id)} back to ${describeFamily(db, fam.id)}.`
          ),
        ],
      });
    }
  }

  // INDI -> FAM: FAMC expects CHIL back; FAMS expects HUSB or WIFE back.
  for (const indi of recordsOfType(db, 'INDI')) {
    if (indi.id === undefined) continue;
    for (const child of indi.root.children) {
      const { tag, pointer, lineNumber } = child.line;
      if (!pointer) continue;
      const fam = db.byId.get(pointer);
      if (!fam || fam.id === undefined) continue;

      if (tag === 'FAMC') {
        if (hasPointerChild(fam, 'CHIL', indi.id)) continue;
        issues.push({
          id: `ASYMMETRIC_LINK:${fam.id}:CHIL:${indi.id}`,
          category: 'ASYMMETRIC_LINK',
          severity: 'invalid',
          message: `@${indi.id}@ is a child (FAMC) of @${fam.id}@, but @${fam.id}@ has no CHIL back to @${indi.id}@.`,
          humanMessage: capitalizeFirst(
            `${nameOf(db, indi.id)} is recorded as a child of ${describeFamily(db, fam.id)}, but that family has no matching child linking back to ${nameOf(db, indi.id)}.`
          ),
          recordIds: [indi.id, fam.id],
          lineNumbers: [lineNumber],
          suggestedFixes: [
            addPointerFix(
              fam,
              'CHIL',
              indi.id,
              `Add CHIL @${indi.id}@ to @${fam.id}@`,
              `Record ${nameOf(db, indi.id)} as a child of ${describeFamily(db, fam.id)}.`
            ),
          ],
        });
      } else if (tag === 'FAMS') {
        if (
          hasPointerChild(fam, 'HUSB', indi.id) ||
          hasPointerChild(fam, 'WIFE', indi.id)
        ) {
          continue;
        }
        // Role is ambiguous; prefer the INDI's SEX, offer both otherwise.
        const sex = getSex(indi);
        const husb = addPointerFix(
          fam,
          'HUSB',
          indi.id,
          `Add HUSB @${indi.id}@ to @${fam.id}@`,
          `Record ${nameOf(db, indi.id)} as the husband in ${describeFamily(db, fam.id)}.`
        );
        const wife = addPointerFix(
          fam,
          'WIFE',
          indi.id,
          `Add WIFE @${indi.id}@ to @${fam.id}@`,
          `Record ${nameOf(db, indi.id)} as the wife in ${describeFamily(db, fam.id)}.`
        );
        const fixes =
          sex === 'M' ? [husb, wife] : sex === 'F' ? [wife, husb] : [husb, wife];
        issues.push({
          id: `ASYMMETRIC_LINK:${fam.id}:SPOUSE:${indi.id}`,
          category: 'ASYMMETRIC_LINK',
          severity: 'invalid',
          message: `@${indi.id}@ is a spouse (FAMS) in @${fam.id}@, but @${fam.id}@ has no HUSB/WIFE back to @${indi.id}@.`,
          humanMessage: capitalizeFirst(
            `${nameOf(db, indi.id)} is recorded as a spouse in ${describeFamily(db, fam.id)}, but that family has no matching spouse linking back to ${nameOf(db, indi.id)}.`
          ),
          recordIds: [indi.id, fam.id],
          lineNumbers: [lineNumber],
          suggestedFixes: fixes,
        });
      }
    }
  }

  return issues;
}
