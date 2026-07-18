import React, { useState } from 'react';
import { Issue } from '../lib/model/Issue';
import { Fix } from '../lib/model/Fix';
import { useRepair } from '../state/RepairStore';
import { LockBadge } from '../app/billing/LockBadge';

// A simple, non-technical way to correct the exact field(s) an issue points
// at, for issues that have no safe automatic fix (we never delete a
// genealogical date on the user's behalf without asking). One labeled text
// input per `issue.quickEdit` field, pre-filled with the current value.
// Saving applies each changed field as its own reversible EditLine (or
// RemoveNode, for "Clear") fix through the normal Fix engine — no new fix
// kind is needed, and each still shows up in Undo.

export function QuickEdit({ issue }: { issue: Issue }) {
  const { dispatch } = useRepair();
  const fields = issue.quickEdit ?? [];
  const [values, setValues] = useState<string[]>(() => fields.map((f) => f.value));

  if (fields.length === 0) return null;

  const dirty = fields.some((f, i) => values[i] !== f.value);

  const setValue = (i: number, v: string) =>
    setValues((vs) => vs.map((old, j) => (j === i ? v : old)));

  const save = () => {
    fields.forEach((field, i) => {
      const next = values[i];
      if (next === field.value) return; // unchanged
      const fix: Fix =
        next.trim() === '' && field.allowClear
          ? { kind: 'RemoveNode', target: { recordId: field.recordId, path: field.path } }
          : {
              kind: 'EditLine',
              target: { recordId: field.recordId, path: field.path },
              newValue: next,
            };
      dispatch({ type: 'APPLY_FIX', fix });
    });
  };

  return (
    <div className="quick-edit">
      <h3>Fix it here</h3>
      {fields.map((field, i) => (
        <div key={i} className="quick-edit-field">
          <label htmlFor={`quick-edit-${i}`}>{field.label}</label>
          <input
            id={`quick-edit-${i}`}
            value={values[i]}
            placeholder={field.value ? undefined : 'not recorded'}
            onChange={(e) => setValue(i, e.target.value)}
          />
          {field.allowClear && values[i] !== '' && (
            <button type="button" className="quick-edit-clear" onClick={() => setValue(i, '')}>
              Clear
            </button>
          )}
        </div>
      ))}
      <div className="quick-edit-actions">
        <button className="primary" disabled={!dirty} onClick={save}>
          Save
        </button>
        {dirty && (
          <button type="button" onClick={() => setValues(fields.map((f) => f.value))}>
            Reset
          </button>
        )}
        <LockBadge />
      </div>
    </div>
  );
}
