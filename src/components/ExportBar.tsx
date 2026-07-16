import React from 'react';
import { serializeDatabase } from '../lib/model/Serialize';
import { useRepair } from '../state/RepairStore';

// Undo/redo controls and a download of the (repaired) GEDCOM text.

export function ExportBar() {
  const { state, dispatch } = useRepair();
  const { db, applied, undone } = state;

  const download = () => {
    if (!db) return;
    const text = serializeDatabase(db);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'repaired.ged';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="export-bar">
      <span className="fix-count">
        {applied.length} fix{applied.length === 1 ? '' : 'es'} applied
      </span>
      <button onClick={() => dispatch({ type: 'UNDO' })} disabled={applied.length === 0}>
        Undo
      </button>
      <button onClick={() => dispatch({ type: 'REDO' })} disabled={undone.length === 0}>
        Redo
      </button>
      <button className="primary" onClick={download} disabled={!db}>
        Export GEDCOM
      </button>
    </div>
  );
}
