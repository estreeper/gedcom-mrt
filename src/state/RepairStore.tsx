import React, { createContext, useContext, useReducer } from 'react';
import { GedcomDatabase } from '../lib/model/Database';
import { Issue } from '../lib/model/Issue';
import { Fix, applyFix } from '../lib/model/Fix';
import { validate } from '../lib/Validator';

// Central store for the repair session: the parsed database, current issues,
// and the undo/redo history. Domain logic lives in src/lib; this only wires it
// to React via useReducer + Context.

interface AppliedFix {
  fix: Fix;
  inverse: Fix;
}

export interface RepairState {
  db?: GedcomDatabase;
  issues: Issue[];
  applied: AppliedFix[];
  undone: Fix[];
  selectedIssueId?: string;
  /** Id of the record currently open in the manual editor, if any. */
  editingRecordId?: string;
}

const initialState: RepairState = { issues: [], applied: [], undone: [] };

type Action =
  | { type: 'LOAD'; db: GedcomDatabase }
  | { type: 'APPLY_FIX'; fix: Fix }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'SELECT_ISSUE'; id: string }
  | { type: 'EDIT_RECORD'; id: string }
  | { type: 'CLOSE_EDITOR' };

function reducer(state: RepairState, action: Action): RepairState {
  switch (action.type) {
    case 'LOAD':
      return {
        db: action.db,
        issues: validate(action.db),
        applied: [],
        undone: [],
        selectedIssueId: undefined,
      };

    case 'APPLY_FIX': {
      if (!state.db) return state;
      const { db, inverse } = applyFix(state.db, action.fix);
      return {
        ...state,
        db,
        issues: validate(db),
        applied: [...state.applied, { fix: action.fix, inverse }],
        undone: [],
        selectedIssueId: undefined,
        editingRecordId: undefined,
      };
    }

    case 'UNDO': {
      if (!state.db || state.applied.length === 0) return state;
      const last = state.applied[state.applied.length - 1];
      const { db } = applyFix(state.db, last.inverse);
      return {
        ...state,
        db,
        issues: validate(db),
        applied: state.applied.slice(0, -1),
        undone: [...state.undone, last.fix],
        selectedIssueId: undefined,
      };
    }

    case 'REDO': {
      if (!state.db || state.undone.length === 0) return state;
      const fix = state.undone[state.undone.length - 1];
      const { db, inverse } = applyFix(state.db, fix);
      return {
        ...state,
        db,
        issues: validate(db),
        applied: [...state.applied, { fix, inverse }],
        undone: state.undone.slice(0, -1),
        selectedIssueId: undefined,
      };
    }

    case 'SELECT_ISSUE':
      return { ...state, selectedIssueId: action.id, editingRecordId: undefined };

    case 'EDIT_RECORD':
      return { ...state, editingRecordId: action.id };

    case 'CLOSE_EDITOR':
      return { ...state, editingRecordId: undefined };
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
