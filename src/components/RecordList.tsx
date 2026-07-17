import React, { useState } from 'react';
import { useRepair, useLeaveGuard } from '../state/RepairStore';
import { VirtualList } from './VirtualList';

// Browse every record with an id and open it in the manual editor. Lets a person
// edit records that no issue points at. The list is virtualized for large files.

const ROW_HEIGHT = 40;

export function RecordList() {
  const { state, dispatch } = useRepair();
  const canLeave = useLeaveGuard();
  const [query, setQuery] = useState('');

  const records = (state.db?.records ?? []).filter((r) => r.id !== undefined);
  const needle = query.trim().toUpperCase();
  const shown = needle
    ? records.filter(
        (r) => r.id!.toUpperCase().includes(needle) || r.type.includes(needle)
      )
    : records;

  const renderRow = (index: number, style?: React.CSSProperties) => {
    const r = shown[index];
    return (
      <div
        key={r.id}
        className={`record-row${r.id === state.editingRecordId ? ' selected' : ''}`}
        style={style}
        onClick={() => {
          if (canLeave()) dispatch({ type: 'EDIT_RECORD', id: r.id! });
        }}
      >
        <span className="record-id">@{r.id}@</span>
        <span className="record-type">{r.type}</span>
      </div>
    );
  };

  return (
    <div className="record-list">
      <div className="record-search">
        <input
          placeholder="Filter records…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <VirtualList
        count={shown.length}
        rowHeight={ROW_HEIGHT}
        className="record-rows"
        render={renderRow}
      />
    </div>
  );
}
