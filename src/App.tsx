import React from 'react';
import './App.css';
import { RepairProvider, useRepair } from './state/RepairStore';
import { FileLoader } from './components/FileLoader';
import { IssueList } from './components/IssueList';
import { IssueDetail } from './components/IssueDetail';
import { ExportBar } from './components/ExportBar';

function AppShell() {
  const { state } = useRepair();

  if (!state.db) {
    return (
      <div className="app app-empty">
        <FileLoader />
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>GEDCOM Repair</h1>
        <ExportBar />
      </header>
      <main className="app-main">
        <aside className="app-sidebar">
          <IssueList />
        </aside>
        <section className="app-content">
          <IssueDetail />
        </section>
      </main>
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
