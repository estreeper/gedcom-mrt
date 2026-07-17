import React, { useState } from 'react';
import { useRepair, useLeaveGuard } from '../state/RepairStore';

// Browse every record with an id and open it in the manual editor. Lets a person
// edit records that no issue points at.

export function RecordList() {
  const { state, dispatch } = useRepair();
  const canLeave = useLeaveGuard();
  const [query, setQuery] = useState('');

  const records = (state.db?.records ?? []).filter((r) => r.id !== undefined);
  const needle = query.trim().toUpperCase();
  const shown = needle
    ? records.filter(
        (r) =>
          r.id!.toUpperCase().includes(needle) ||
          r.type.includes(needle)
      )
    : records;

  return (
    <div className="record-list">
      <div className="record-search">
        <input
          placeholder="Filter records…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <ul>
        {shown.map((r) => (
          <li
            key={r.id}
            className={`record-row${r.id === state.editingRecordId ? ' selected' : ''}`}
            onClick={() => {
              if (canLeave()) dispatch({ type: 'EDIT_RECORD', id: r.id! });
            }}
          >
            <span className="record-id">@{r.id}@</span>
            <span className="record-type">{r.type}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
