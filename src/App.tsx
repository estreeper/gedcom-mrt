import React from 'react';
import './App.css';
import { RepairProvider, useRepair } from './state/RepairStore';
import { FileLoader } from './components/FileLoader';
import { Sidebar } from './components/Sidebar';
import { IssueDetail } from './components/IssueDetail';
import { RecordEditor } from './components/RecordEditor';
import { ExportBar } from './components/ExportBar';

function AppShell() {
  const { state, dispatch } = useRepair();

  if (!state.db) {
    return (
      <div className="app app-empty">
        <FileLoader />
      </div>
    );
  }

  const newFile = () => {
    if (
      window.confirm(
        'Start over with a new file? This clears the current saved session.'
      )
    ) {
      dispatch({ type: 'RESET' });
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          <h1>GEDCOM Repair</h1>
          {state.fileName && <span className="file-name">{state.fileName}</span>}
          {state.restored && (
            <span className="restored-note" title="Loaded from your last session">
              restored
            </span>
          )}
        </div>
        <div className="header-actions">
          <button onClick={newFile}>New file</button>
          <ExportBar />
        </div>
      </header>
      <main className="app-main">
        <aside className="app-sidebar">
          <Sidebar />
        </aside>
        <section className="app-content">
          {state.editingRecordId ? (
            <RecordEditor
              key={state.editingRecordId}
              recordId={state.editingRecordId}
            />
          ) : (
            <IssueDetail />
          )}
        </section>
      </main>
      <BulkProgress />
    </div>
  );
}

function BulkProgress() {
  const { state } = useRepair();
  if (!state.bulkInProgress) return null;
  const pct = state.bulkTotal
    ? Math.round((state.bulkDone / state.bulkTotal) * 100)
    : 0;
  return (
    <div className="bulk-overlay" role="dialog" aria-label="Applying fixes">
      <div className="bulk-modal">
        <p className="bulk-modal-title">Applying fixes…</p>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <p className="bulk-modal-count">
          {state.bulkDone} of {state.bulkTotal}
        </p>
      </div>
    </div>
  );
}

function App() {
  return (
    <RepairProvider>
      <AppShell />
    </RepairProvider>
  );
}

export default App;
