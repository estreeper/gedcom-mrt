import React, { useState } from 'react';
import { useRepair } from '../state/RepairStore';
import { IssueList } from './IssueList';
import { RecordList } from './RecordList';

// Left panel: switch between the detected-issues list and a record browser.

export function Sidebar() {
  const { state } = useRepair();
  const [tab, setTab] = useState<'issues' | 'records'>('issues');

  return (
    <div className="sidebar">
      <div className="sidebar-tabs">
        <button
          className={tab === 'issues' ? 'active' : ''}
          onClick={() => setTab('issues')}
        >
          Issues ({state.issues.length})
        </button>
        <button
          className={tab === 'records' ? 'active' : ''}
          onClick={() => setTab('records')}
        >
          Records
        </button>
      </div>
      {tab === 'issues' ? <IssueList /> : <RecordList />}
    </div>
  );
}
