import React, { useEffect } from 'react';
import { create } from 'zustand';
import { GedcomDatabase } from '../lib/model/Database';
import { Issue, IssueCategory, Severity } from '../lib/model/Issue';
import { Fix, applyFix, applyFixesBatched, orderBulkFixes } from '../lib/model/Fix';
import { validate } from '../lib/Validator';
import { parseText } from '../lib/Parser';
import { serializeDatabase } from '../lib/model/Serialize';
import { loadSession, saveSession, clearSession } from '../lib/idb';

// Central repair-session store (Zustand). Domain logic lives in src/lib; this
// wires it to React and persists the working session to IndexedDB.

interface AppliedFix {
  fix: Fix;
  inverse: Fix;
}

/** Issue-list filter: a category, or 'ALL' for no filter. */
export type IssueFilter = IssueCategory | 'ALL';

export interface RepairState {
  db?: GedcomDatabase;
  fileName?: string;
  /** True when the current db was restored from a saved IndexedDB session. */
  restored: boolean;
  issues: Issue[];
  resolved: Issue[];
  applied: AppliedFix[];
  undone: Fix[];
  filter: IssueFilter;
  selectedIssueId?: string;
  selectedIssueIds: string[];
  editingRecordId?: string;
  editorDirty: boolean;
  /** Bulk-accept progress (0 total = not running). */
  bulkInProgress: boolean;
  bulkDone: number;
  bulkTotal: number;
}

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

export function sortIssues(issues: Issue[]): Issue[] {
  return [...issues].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  );
}

export function visibleIssues(issues: Issue[], filter: IssueFilter): Issue[] {
  const sorted = sortIssues(issues);
  return filter === 'ALL' ? sorted : sorted.filter((i) => i.category === filter);
}

function updateResolved(prev: Issue[], oldIssues: Issue[], newIssues: Issue[]): Issue[] {
  const newIds = new Set(newIssues.map((i) => i.id));
  const kept = prev.filter((r) => !newIds.has(r.id));
  const keptIds = new Set(kept.map((r) => r.id));
  const newlyResolved = oldIssues.filter(
    (o) => !newIds.has(o.id) && !keptIds.has(o.id)
  );
  return [...kept, ...newlyResolved];
}

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

// --- store -----------------------------------------------------------------

interface RepairActions {
  load(db: GedcomDatabase, name?: string, restored?: boolean): void;
  applyFixAction(fix: Fix): void;
  bulkAccept(): void;
  undo(): void;
  redo(): void;
  setFilter(filter: IssueFilter): void;
  selectIssue(id: string): void;
  toggleIssueSelected(id: string): void;
  setIssueSelection(ids: string[]): void;
  editRecord(id: string): void;
  closeEditor(): void;
  setEditorDirty(value: boolean): void;
  reset(): void;
}

type Store = RepairState & RepairActions;

const initialState: RepairState = {
  restored: false,
  issues: [],
  resolved: [],
  applied: [],
  undone: [],
  filter: 'ALL',
  selectedIssueIds: [],
  editorDirty: false,
  bulkInProgress: false,
  bulkDone: 0,
  bulkTotal: 0,
};

export const useRepairStore = create<Store>((set, get) => ({
  ...initialState,

  load(db, name, restored = false) {
    const issues = validate(db);
    set({
      db,
      fileName: name,
      restored,
      issues,
      resolved: [],
      applied: [],
      undone: [],
      filter: 'ALL',
      selectedIssueId: visibleIssues(issues, 'ALL')[0]?.id,
      selectedIssueIds: [],
      editingRecordId: undefined,
      editorDirty: false,
    });
  },

  applyFixAction(fix) {
    const state = get();
    if (!state.db) return;
    const { db, inverse } = applyFix(state.db, fix);
    const issues = validate(db);
    set({
      db,
      issues,
      resolved: updateResolved(state.resolved, state.issues, issues),
      applied: [...state.applied, { fix, inverse }],
      undone: [],
      selectedIssueId: nextSelected(state.issues, issues, state.filter, state.selectedIssueId),
      selectedIssueIds: pruneSelection(state.selectedIssueIds, issues),
      editingRecordId: undefined,
      editorDirty: false,
    });
  },

  async bulkAccept() {
    const start = get();
    if (!start.db) return;

    // Gather the primary fix of each selected issue that has one.
    const byId = new Map(start.issues.map((i) => [i.id, i]));
    const gathered: Fix[] = [];
    for (const id of start.selectedIssueIds) {
      const issue = byId.get(id);
      if (issue && issue.suggestedFixes.length > 0) {
        gathered.push(issue.suggestedFixes[0].fix);
      }
    }
    const fixes = orderBulkFixes(gathered);
    const total = fixes.length;
    if (total === 0) return;

    set({ bulkInProgress: true, bulkDone: 0, bulkTotal: total });
    // Let the progress overlay paint before the work starts.
    await new Promise((r) => setTimeout(r, 0));

    let db = start.db;
    const applied = [...start.applied];
    const CHUNK = 400;
    for (let i = 0; i < fixes.length; i += CHUNK) {
      const res = applyFixesBatched(db, fixes.slice(i, i + CHUNK));
      db = res.db;
      applied.push(...res.applied);
      set({ bulkDone: Math.min(i + CHUNK, total) });
      // Yield so the browser repaints the progress bar between chunks.
      await new Promise((r) => setTimeout(r, 0));
    }

    const issues = validate(db);
    set({
      db,
      issues,
      resolved: updateResolved(start.resolved, start.issues, issues),
      applied,
      undone: [],
      selectedIssueIds: pruneSelection(start.selectedIssueIds, issues),
      selectedIssueId: visibleIssues(issues, start.filter)[0]?.id,
      editingRecordId: undefined,
      editorDirty: false,
      bulkInProgress: false,
      bulkDone: 0,
      bulkTotal: 0,
    });
  },

  undo() {
    const state = get();
    if (!state.db || state.applied.length === 0) return;
    const last = state.applied[state.applied.length - 1];
    const { db } = applyFix(state.db, last.inverse);
    const issues = validate(db);
    set({
      db,
      issues,
      resolved: updateResolved(state.resolved, state.issues, issues),
      applied: state.applied.slice(0, -1),
      undone: [...state.undone, last.fix],
      selectedIssueId: visibleIssues(issues, state.filter)[0]?.id,
      selectedIssueIds: pruneSelection(state.selectedIssueIds, issues),
      editingRecordId: undefined,
      editorDirty: false,
    });
  },

  redo() {
    const state = get();
    if (!state.db || state.undone.length === 0) return;
    const fix = state.undone[state.undone.length - 1];
    const { db, inverse } = applyFix(state.db, fix);
    const issues = validate(db);
    set({
      db,
      issues,
      resolved: updateResolved(state.resolved, state.issues, issues),
      applied: [...state.applied, { fix, inverse }],
      undone: state.undone.slice(0, -1),
      selectedIssueId: visibleIssues(issues, state.filter)[0]?.id,
      selectedIssueIds: pruneSelection(state.selectedIssueIds, issues),
      editingRecordId: undefined,
      editorDirty: false,
    });
  },

  setFilter(filter) {
    const state = get();
    set({
      filter,
      selectedIssueId: visibleIssues(state.issues, filter)[0]?.id,
      editingRecordId: undefined,
      editorDirty: false,
    });
  },

  selectIssue(id) {
    set({ selectedIssueId: id, editingRecordId: undefined, editorDirty: false });
  },

  toggleIssueSelected(id) {
    const cur = get().selectedIssueIds;
    set({
      selectedIssueIds: cur.includes(id)
        ? cur.filter((x) => x !== id)
        : [...cur, id],
    });
  },

  setIssueSelection(ids) {
    set({ selectedIssueIds: ids });
  },

  editRecord(id) {
    set({ editingRecordId: id, editorDirty: false });
  },

  closeEditor() {
    set({ editingRecordId: undefined, editorDirty: false });
  },

  setEditorDirty(value) {
    set({ editorDirty: value });
  },

  reset() {
    // Explicit undefineds: a partial set() merges, so omitted optional keys
    // (db, fileName, …) would otherwise linger.
    set({
      db: undefined,
      fileName: undefined,
      restored: false,
      issues: [],
      resolved: [],
      applied: [],
      undone: [],
      filter: 'ALL',
      selectedIssueId: undefined,
      selectedIssueIds: [],
      editingRecordId: undefined,
      editorDirty: false,
      bulkInProgress: false,
      bulkDone: 0,
      bulkTotal: 0,
    });
    clearSession();
  },
}));

// --- compatibility hook + dispatch -----------------------------------------
// Components keep using useRepair()/dispatch(action); it routes to the store.

type Action =
  | { type: 'LOAD'; db: GedcomDatabase; name?: string }
  | { type: 'APPLY_FIX'; fix: Fix }
  | { type: 'BULK_ACCEPT' }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'SET_FILTER'; filter: IssueFilter }
  | { type: 'SELECT_ISSUE'; id: string }
  | { type: 'TOGGLE_ISSUE_SELECTED'; id: string }
  | { type: 'SET_ISSUE_SELECTION'; ids: string[] }
  | { type: 'EDIT_RECORD'; id: string }
  | { type: 'CLOSE_EDITOR' }
  | { type: 'SET_EDITOR_DIRTY'; value: boolean }
  | { type: 'RESET' };

export function dispatch(action: Action): void {
  const s = useRepairStore.getState();
  switch (action.type) {
    case 'LOAD': return s.load(action.db, action.name);
    case 'APPLY_FIX': return s.applyFixAction(action.fix);
    case 'BULK_ACCEPT': return s.bulkAccept();
    case 'UNDO': return s.undo();
    case 'REDO': return s.redo();
    case 'SET_FILTER': return s.setFilter(action.filter);
    case 'SELECT_ISSUE': return s.selectIssue(action.id);
    case 'TOGGLE_ISSUE_SELECTED': return s.toggleIssueSelected(action.id);
    case 'SET_ISSUE_SELECTION': return s.setIssueSelection(action.ids);
    case 'EDIT_RECORD': return s.editRecord(action.id);
    case 'CLOSE_EDITOR': return s.closeEditor();
    case 'SET_EDITOR_DIRTY': return s.setEditorDirty(action.value);
    case 'RESET': return s.reset();
  }
}

export function useRepair(): { state: RepairState; dispatch: typeof dispatch } {
  const state = useRepairStore();
  return { state, dispatch };
}

export function useLeaveGuard(): () => boolean {
  const dirty = useRepairStore((s) => s.editorDirty);
  return () =>
    !dirty ||
    window.confirm('You have unsaved changes to this record. Discard them?');
}

// --- provider: restore on mount, autosave on change ------------------------

export function RepairProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    let cancelled = false;

    // Restore the last session unless a file has already been loaded.
    loadSession().then((session) => {
      if (cancelled || !session || useRepairStore.getState().db) return;
      try {
        const db = parseText(session.text);
        useRepairStore.getState().load(db, session.name, true);
      } catch {
        // Corrupt saved session — ignore and start fresh.
      }
    });

    // Autosave the repaired text whenever the database changes (debounced).
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = useRepairStore.subscribe((state, prev) => {
      if (state.db === prev.db) return;
      if (timer) clearTimeout(timer);
      const { db, fileName } = state;
      timer = setTimeout(() => {
        if (db) saveSession({ name: fileName ?? 'repaired.ged', text: serializeDatabase(db) });
      }, 600);
    });

    return () => {
      cancelled = true;
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, []);

  return <>{children}</>;
}
