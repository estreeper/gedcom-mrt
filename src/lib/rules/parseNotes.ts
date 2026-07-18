import { GedcomDatabase, ParseNote } from '../model/Database';
import { Issue, IssueCategory } from '../model/Issue';

// Surfaces problems already noticed while parsing (see Parser.ts's ParseNote
// production) as first-class issues, plus a missing HEAD/TRLR. All of these
// are fingerprints of a damaged file — not something a person typed on
// purpose — so they sit at the top 'invalid' tier, alongside the broken-link
// checks in Validator.ts. Flag-only: there's no safe way to reconstruct a
// missing header/trailer or guess what a malformed line meant to say.

const CODE_TO_CATEGORY: Record<ParseNote['code'], IssueCategory> = {
  DUPLICATE_XREF: 'DUPLICATE_XREF',
  BAD_LEVEL: 'BAD_LEVEL',
  MALFORMED_LINE: 'MALFORMED_LINE',
  ORPHAN_LINE: 'ORPHAN_LINE',
};

export function parseNoteRules(db: GedcomDatabase): Issue[] {
  const issues: Issue[] = [];

  for (const note of db.parseNotes) {
    issues.push({
      id: `${CODE_TO_CATEGORY[note.code]}:${note.lineNumber}`,
      category: CODE_TO_CATEGORY[note.code],
      severity: 'invalid',
      message: note.message,
      recordIds: [],
      lineNumbers: [note.lineNumber],
      suggestedFixes: [],
    });
  }

  if (!db.header) {
    issues.push({
      id: 'MISSING_HEADER',
      category: 'MISSING_HEADER',
      severity: 'invalid',
      message: 'The file has no HEAD record.',
      humanMessage: 'This file is missing its header record.',
      recordIds: [],
      lineNumbers: [],
      suggestedFixes: [],
    });
  }

  if (!db.trailer) {
    issues.push({
      id: 'MISSING_TRAILER',
      category: 'MISSING_TRAILER',
      severity: 'invalid',
      message: 'The file has no TRLR record.',
      humanMessage: 'This file is missing its trailer record.',
      recordIds: [],
      lineNumbers: [],
      suggestedFixes: [],
    });
  }

  return issues;
}
