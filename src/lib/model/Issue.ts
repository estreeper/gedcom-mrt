import { Fix } from './Fix';

// A validation finding, optionally carrying one or more suggested fixes.

export type Severity = 'error' | 'warning' | 'info';

export type IssueCategory =
  | 'DANGLING_POINTER'
  | 'ASYMMETRIC_LINK'
  | 'ORPHAN_INDI'
  | 'MISSING_SUBRECORD'
  | 'MALFORMED_LINE'
  | 'UNKNOWN_TAG'
  | 'DUPLICATE_XREF'
  | 'BAD_LEVEL'
  | 'MISSING_HEADER'
  | 'MISSING_TRAILER';

export interface SuggestedFix {
  /** Short label for the button, e.g. "Add reciprocal FAMC to @I3@". */
  label: string;
  fix: Fix;
}

export interface Issue {
  /** Stable id so the UI can track an issue across re-validation. */
  id: string;
  category: IssueCategory;
  severity: Severity;
  /** Precise, technical description (uses @xref@ ids). Shown in the list. */
  message: string;
  /**
   * Plain-language description using record names where practicable (e.g.
   * "John /Smith/" instead of "@I2@"). Shown above the technical message in the
   * detail pane. Optional — falls back to `message` when absent.
   */
  humanMessage?: string;
  /** Records involved, for navigation/highlighting. */
  recordIds: string[];
  /** Source line numbers involved. */
  lineNumbers: number[];
  /** Zero or more reviewable fixes; empty means manual editing only. */
  suggestedFixes: SuggestedFix[];
}
