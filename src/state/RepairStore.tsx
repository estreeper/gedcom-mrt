import React, { createContext, useContext, useReducer } from 'react';
import { GedcomDatabase } from '../lib/model/Database';
import { Issue, IssueCategory, Severity } from '../lib/model/Issue';
import { Fix, applyFix } from '../lib/model/Fix';
import { validate } from '../lib/Validator';

// Central store for the repair session: the parsed database, current issues,
// resolved issues, and the undo/redo history. Domain logic lives in src/lib;
// this only wires it to React via useReducer + Context.

interface AppliedFix {
  fix: Fix;
  inverse: Fix;
}

/** Issue-list filter: a category, or 'ALL' for no filter. */
export type IssueFilter = IssueCategory | 'ALL';

export interface RepairState {
  db?: GedcomDatabase;
  issues: Issue[];
  /** Issues that were present earlier but a fix has since cleared. */
  resolved: Issue[];
  applied: AppliedFix[];
  undone: Fix[];
  filter: IssueFilter;
  selectedIssueId?: string;
  /** Ids of issues checked for bulk actions. */
  selectedIssueIds: string[];
  /** Id of the record currently open in the manual editor, if any. */
  editingRecordId?: string;
  /** True when the open editor has unsaved changes (drives the leave guard). */
  editorDirty: boolean;
}

const initialState: RepairState = {
  issues: [],
  resolved: [],
  applied: [],
  undone: [],
  filter: 'ALL',
  selectedIssueIds: [],
  editorDirty: false,
};

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

/** Issues sorted by severity (errors first), stable within a severity. */
export function sortIssues(issues: Issue[]): Issue[] {
  return [...issues].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  );
}

/** The issues shown in the list for a given filter: sorted, then narrowed. */
export function visibleIssues(issues: Issue[], filter: IssueFilter): Issue[] {
  const sorted = sortIssues(issues);
  return filter === 'ALL' ? sorted : sorted.filter((i) => i.category === filter);
}

/**
 * Track resolved issues across a validation transition: any issue that was
 * active before and is gone now becomes resolved; any resolved issue that has
 * reappeared (e.g. after an undo) is dropped back to active.
 */
function updateResolved(
  prev: Issue[],
  oldIssues: Issue[],
  newIssues: Issue[]
): Issue[] {
  const newIds = new Set(newIssues.map((i) => i.id));
  const kept = prev.filter((r) => !newIds.has(r.id));
  const keptIds = new Set(kept.map((r) => r.id));
  const newlyResolved = oldIssues.filter(
    (o) => !newIds.has(o.id) && !keptIds.has(o.id)
  );
  return [...kept, ...newlyResolved];
}

/**
 * After a fix resolves the selected issue, pick which issue to open next:
 * prefer the one that followed it in the list; otherwise the item that shifted
 * into its place; otherwise nothing.
 */
/** Keep only the selected ids that still correspond to an active issue. */
function pruneSelection(selected: string[], issues: Issue[]): string[] {
  const ids = new Set(issues.map((i) => i.id));
  return selected.filter((id) => ids.has(id));
}

function nextSelected(
  oldIssues: Issue[],
  newIssues: Issue[],
  filter: IssueFilter,
  selectedId: string | undefined
): string | undefined {
  const oldVis = visibleIssues(oldIssues, filter);
  const newVis = visibleIssues(newIssues, filter);
  if (newVis.length === 0) return undefined;

  const idx = oldVis.findIndex((i) => i.id === selectedId);
  if (idx >= 0) {
    const following = oldVis[idx + 1]?.id;
    if (following && newVis.some((i) => i.id === following)) return following;
    return newVis[Math.min(idx, newVis.length - 1)].id;
  }
  return newVis[0].id;
}

type Action =
  | { type: 'LOAD'; db: GedcomDatabase }
  | { type: 'APPLY_FIX'; fix: Fix }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'SET_FILTER'; filter: IssueFilter }
  | { type: 'SELECT_ISSUE'; id: string }
  | { type: 'TOGGLE_ISSUE_SELECTED'; id: string }
  | { type: 'SET_ISSUE_SELECTION'; ids: string[] }
  | { type: 'BULK_ACCEPT' }
  | { type: 'EDIT_RECORD'; id: string }
  | { type: 'CLOSE_EDITOR' }
  | { type: 'SET_EDITOR_DIRTY'; value: boolean };

function reducer(state: RepairState, action: Action): RepairState {
  switch (action.type) {
    case 'LOAD': {
      const issues = validate(action.db);
      return {
        db: action.db,
        issues,
        resolved: [],
        applied: [],
        undone: [],
        filter: 'ALL',
        selectedIssueId: visibleIssues(issues, 'ALL')[0]?.id,
        selectedIssueIds: [],
        editorDirty: false,
      };
    }

    case 'APPLY_FIX': {
      if (!state.db) return state;
      const { db, inverse } = applyFix(state.db, action.fix);
      const issues = validate(db);
      return {
        ...state,
        db,
        issues,
        resolved: updateResolved(state.resolved, state.issues, issues),
        applied: [...state.applied, { fix: action.fix, inverse }],
        undone: [],
        selectedIssueId: nextSelected(
          state.issues,
          issues,
          state.filter,
          state.selectedIssueId
        ),
        selectedIssueIds: pruneSelection(state.selectedIssueIds, issues),
        editingRecordId: undefined,
        editorDirty: false,
      };
    }

    case 'UNDO': {
      if (!state.db || state.applied.length === 0) return state;
      const last = state.applied[state.applied.length - 1];
      const { db } = applyFix(state.db, last.inverse);
      const issues = validate(db);
      return {
        ...state,
        db,
        issues,
        resolved: updateResolved(state.resolved, state.issues, issues),
        applied: state.applied.slice(0, -1),
        undone: [...state.undone, last.fix],
        selectedIssueId: visibleIssues(issues, state.filter)[0]?.id,
        selectedIssueIds: pruneSelection(state.selectedIssueIds, issues),
        editingRecordId: undefined,
        editorDirty: false,
      };
    }

    case 'REDO': {
      if (!state.db || state.undone.length === 0) return state;
      const fix = state.undone[state.undone.length - 1];
      const { db, inverse } = applyFix(state.db, fix);
      const issues = validate(db);
      return {
        ...state,
        db,
        issues,
        resolved: updateResolved(state.resolved, state.issues, issues),
        applied: [...state.applied, { fix, inverse }],
        undone: state.undone.slice(0, -1),
        selectedIssueId: visibleIssues(issues, state.filter)[0]?.id,
        selectedIssueIds: pruneSelection(state.selectedIssueIds, issues),
        editingRecordId: undefined,
        editorDirty: false,
      };
    }

    case 'BULK_ACCEPT': {
      if (!state.db) return state;
      let db = state.db;
      let issues = state.issues;
      let resolved = state.resolved;
      const applied = [...state.applied];

      for (const id of state.selectedIssueIds) {
        const issue = issues.find((i) => i.id === id);
        if (!issue || issue.suggestedFixes.length === 0) continue;
        try {
          const { db: newDb, inverse } = applyFix(db, issue.suggestedFixes[0].fix);
          const newIssues = validate(newDb);
          resolved = updateResolved(resolved, issues, newIssues);
          applied.push({ fix: issue.suggestedFixes[0].fix, inverse });
          db = newDb;
          issues = newIssues;
        } catch {
          // A fix that no longer applies (e.g. superseded by an earlier one) is
          // skipped rather than aborting the whole batch.
        }
      }

      return {
        ...state,
        db,
        issues,
        resolved,
        applied,
        undone: [],
        selectedIssueIds: pruneSelection(state.selectedIssueIds, issues),
        selectedIssueId: visibleIssues(issues, state.filter)[0]?.id,
        editingRecordId: undefined,
        editorDirty: false,
      };
    }

    case 'SET_FILTER': {
      const visible = visibleIssues(state.issues, action.filter);
      return {
        ...state,
        filter: action.filter,
        selectedIssueId: visible[0]?.id,
        editingRecordId: undefined,
        editorDirty: false,
      };
    }

    case 'SELECT_ISSUE':
      return {
        ...state,
        selectedIssueId: action.id,
        editingRecordId: undefined,
        editorDirty: false,
      };

    case 'TOGGLE_ISSUE_SELECTED': {
      const has = state.selectedIssueIds.includes(action.id);
      return {
        ...state,
        selectedIssueIds: has
          ? state.selectedIssueIds.filter((id) => id !== action.id)
          : [...state.selectedIssueIds, action.id],
      };
    }

    case 'SET_ISSUE_SELECTION':
      return { ...state, selectedIssueIds: action.ids };

    case 'EDIT_RECORD':
      return { ...state, editingRecordId: action.id, editorDirty: false };

    case 'CLOSE_EDITOR':
      return { ...state, editingRecordId: undefined, editorDirty: false };

    case 'SET_EDITOR_DIRTY':
      return { ...state, editorDirty: action.value };
  }
}

interface RepairContextValue {
  state: RepairState;
  dispatch: React.Dispatch<Action>;
}

const RepairContext = createContext<RepairContextValue | undefined>(undefined);

export function RepairProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return (
    <RepairContext.Provider value={{ state, dispatch }}>
      {children}
    </RepairContext.Provider>
  );
}

export function useRepair(): RepairContextValue {
  const ctx = useContext(RepairContext);
  if (!ctx) throw new Error('useRepair must be used within a RepairProvider');
  return ctx;
}

/**
 * Returns a guard to call before any action that would leave the open record
 * editor. It returns true to proceed; if the editor has unsaved changes it first
 * asks the user to confirm discarding them.
 */
export function useLeaveGuard(): () => boolean {
  const { state } = useRepair();
  return () =>
    !state.editorDirty ||
    window.confirm('You have unsaved changes to this record. Discard them?');
}
