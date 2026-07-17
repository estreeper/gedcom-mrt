import React, { useEffect, useRef } from 'react';
import { Issue, IssueCategory } from '../lib/model/Issue';
import {
  useRepair,
  useLeaveGuard,
  visibleIssues,
  IssueFilter,
} from '../state/RepairStore';

// The list of detected (active) issues: a summary header, a filter-by-type
// control, per-issue checkboxes with a select-all, a Bulk Actions section, and
// the issue rows themselves.

export function IssueList() {
  const { state, dispatch } = useRepair();
  const canLeave = useLeaveGuard();
  const shown = visibleIssues(state.issues, state.filter);

  const counts = state.issues.reduce<Record<string, number>>((acc, i) => {
    acc[i.severity] = (acc[i.severity] ?? 0) + 1;
    return acc;
  }, {});

  // Category -> count, over all active issues, for the filter options.
  const byCategory = new Map<IssueCategory, number>();
  for (const i of state.issues) {
    byCategory.set(i.category, (byCategory.get(i.category) ?? 0) + 1);
  }

  // Selection state.
  const selectedSet = new Set(state.selectedIssueIds);
  const shownIds = shown.map((i) => i.id);
  const allShownSelected =
    shown.length > 0 && shownIds.every((id) => selectedSet.has(id));
  const someShownSelected = shownIds.some((id) => selectedSet.has(id));
  const selectedCount = state.selectedIssueIds.length;
  const acceptableCount = state.selectedIssueIds.filter((id) => {
    const iss = state.issues.find((i) => i.id === id);
    return iss !== undefined && iss.suggestedFixes.length > 0;
  }).length;

  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someShownSelected && !allShownSelected;
    }
  });

  const toggleAll = () => {
    const set = new Set(state.selectedIssueIds);
    if (allShownSelected) shownIds.forEach((id) => set.delete(id));
    else shownIds.forEach((id) => set.add(id));
    dispatch({ type: 'SET_ISSUE_SELECTION', ids: Array.from(set) });
  };

  const acceptAll = () => {
    if (acceptableCount === 0 || !canLeave()) return;
    const msg = `You are about to accept ${acceptableCount} change${
      acceptableCount === 1 ? '' : 's'
    }.`;
    if (window.confirm(msg)) dispatch({ type: 'BULK_ACCEPT' });
  };

  return (
    <div className="issue-list">
      <div className="issue-summary">
        {state.issues.length === 0 ? (
          <span className="ok">No issues found.</span>
        ) : (
          <span>
            {state.issues.length} issue{state.issues.length === 1 ? '' : 's'}
            {counts.error ? ` · ${counts.error} error` : ''}
            {counts.warning ? ` · ${counts.warning} warning` : ''}
          </span>
        )}
      </div>

      {state.issues.length > 0 && (
        <div className="issue-filter-bar">
          <label htmlFor="issue-filter">Type</label>
          <select
            id="issue-filter"
            className="issue-filter"
            value={state.filter}
            onChange={(e) => {
              if (canLeave())
                dispatch({
                  type: 'SET_FILTER',
                  filter: e.target.value as IssueFilter,
                });
            }}
          >
            <option value="ALL">All types ({state.issues.length})</option>
            {Array.from(byCategory.entries()).map(([cat, n]) => (
              <option key={cat} value={cat}>
                {cat} ({n})
              </option>
            ))}
          </select>
        </div>
      )}

      {state.issues.length > 0 && (
        <div className="select-all-bar">
          <label className="select-all">
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allShownSelected}
              onChange={toggleAll}
            />
            Select all
          </label>
          {selectedCount > 0 && <span className="selected-count">{selectedCount} selected</span>}
        </div>
      )}

      {selectedCount > 0 && (
        <div className="bulk-actions">
          <span className="bulk-title">Bulk Actions</span>
          <div className="bulk-buttons">
            <button
              className="accept"
              onClick={acceptAll}
              disabled={acceptableCount === 0}
              title={
                acceptableCount === 0
                  ? 'None of the selected issues have an automatic fix'
                  : undefined
              }
            >
              Accept All ({acceptableCount})
            </button>
            <button onClick={() => dispatch({ type: 'SET_ISSUE_SELECTION', ids: [] })}>
              Clear
            </button>
          </div>
        </div>
      )}

      <ul>
        {shown.map((issue) => (
          <IssueRow
            key={issue.id}
            issue={issue}
            selected={issue.id === state.selectedIssueId}
            checked={selectedSet.has(issue.id)}
            onToggle={() =>
              dispatch({ type: 'TOGGLE_ISSUE_SELECTED', id: issue.id })
            }
            onSelect={() => {
              if (canLeave()) dispatch({ type: 'SELECT_ISSUE', id: issue.id });
            }}
          />
        ))}
        {state.issues.length > 0 && shown.length === 0 && (
          <li className="issue-empty">No issues of this type.</li>
        )}
      </ul>
    </div>
  );
}

function IssueRow({
  issue,
  selected,
  checked,
  onToggle,
  onSelect,
}: {
  issue: Issue;
  selected: boolean;
  checked: boolean;
  onToggle: () => void;
  onSelect: () => void;
}) {
  return (
    <li
      className={`issue-row severity-${issue.severity}${selected ? ' selected' : ''}`}
      onClick={onSelect}
    >
      <input
        type="checkbox"
        className="issue-check"
        checked={checked}
        onClick={(e) => e.stopPropagation()}
        onChange={onToggle}
        aria-label={`Select ${issue.category}`}
      />
      <div className="issue-row-body">
        <span className={`badge severity-${issue.severity}`}>{issue.category}</span>
        <span className="issue-message">{issue.message}</span>
      </div>
    </li>
  );
}
