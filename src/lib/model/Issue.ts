import { Fix, NodePath } from './Fix';

// A validation finding, optionally carrying one or more suggested fixes.

// Four tiers, ordered by how confident we are that something is genuinely
// wrong and *why* — not just how bad it looks:
//   invalid  - the file itself is damaged/corrupted (a broken pointer, a
//              malformed line) — not something a person would type on purpose.
//   error    - valid GEDCOM, but the data is logically impossible (a death
//              before a birth): it cannot ever be correct.
//   warning  - valid and possible, but statistically improbable (a marriage
//              at age 8): usually a mistake, but not guaranteed.
//   info     - incomplete or otherwise worth a look, but often legitimate
//              (no sources, no recorded children).
export type Severity = 'invalid' | 'error' | 'warning' | 'info';

export const SEVERITY_LABELS: Record<Severity, string> = {
  invalid: 'Invalid',
  error: 'Error',
  warning: 'Likely error',
  info: 'Possible issue',
};

export type IssueCategory =
  // invalid — corruption
  | 'DANGLING_POINTER'
  | 'ASYMMETRIC_LINK'
  | 'MALFORMED_LINE'
  | 'DUPLICATE_XREF'
  | 'BAD_LEVEL'
  | 'ORPHAN_LINE'
  | 'MISSING_HEADER'
  | 'MISSING_TRAILER'
  // error — logically impossible data
  | 'DEATH_BEFORE_BIRTH'
  | 'FUTURE_DATE'
  | 'MARRIAGE_AFTER_DEATH'
  | 'MARRIAGE_BEFORE_BIRTH'
  | 'PARENT_BORN_AFTER_CHILD'
  | 'UNREALISTIC_LIFESPAN'
  | 'EVENT_ORDER_IMPOSSIBLE'
  | 'CIRCULAR_ANCESTRY'
  | 'SELF_REFERENTIAL_RELATION'
  // warning — improbable but possible
  | 'YOUNG_MARRIAGE'
  | 'PLURAL_MARRIAGE'
  | 'IMPLAUSIBLE_PARENT_AGE'
  // info — incomplete / suspect
  | 'ORPHAN_INDI'
  | 'MISSING_LIFE_DATES'
  | 'CHILDLESS_FAMILY'
  | 'MISSING_SOURCES'
  | 'DUPLICATE_INDIVIDUAL'
  // not yet produced by any rule — roadmap
  | 'MISSING_SUBRECORD'
  | 'UNKNOWN_TAG';

export interface SuggestedFix {
  /** Short technical label, e.g. "Add FAMC @F1@ to @I3@". */
  label: string;
  /** Plain-language description of what accepting the fix does, using names. */
  humanLabel?: string;
  fix: Fix;
}

/** One field a non-technical user can correct inline from the issue detail
 *  pane, without opening the full record editor. Rendered by `QuickEdit`. */
export interface QuickEditField {
  recordId: string;
  /** Node path of the line to edit (its DATE/value line, not the event wrapper). */
  path: NodePath['path'];
  /** Plain-language label, e.g. "Birth date". */
  label: string;
  /** The current raw value, pre-filled into the input. */
  value: string;
  /** Whether "Remove this value" (delete the line) is offered alongside Save. */
  allowClear?: boolean;
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
  /** Simple field-level corrections offered when there's no safe automatic
   *  fix — an easier alternative to the full manual record editor. */
  quickEdit?: QuickEditField[];
}
