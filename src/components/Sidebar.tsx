import React, { useState } from 'react';
import { useRepair } from '../state/RepairStore';
import { IssueList } from './IssueList';
import { ResolvedList } from './ResolvedList';
import { RecordList } from './RecordList';

// Left panel: switch between active issues, resolved issues, and a record
// browser.

type Tab = 'issues' | 'resolved' | 'records';

export function Sidebar() {
  const { state } = useRepair();
  const [tab, setTab] = useState<Tab>('issues');

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
          className={tab === 'resolved' ? 'active' : ''}
          onClick={() => setTab('resolved')}
        >
          Resolved ({state.resolved.length})
        </button>
        <button
          className={tab === 'records' ? 'active' : ''}
          onClick={() => setTab('records')}
        >
          Records
        </button>
      </div>
      <div className="sidebar-body">
        {tab === 'issues' && <IssueList />}
        {tab === 'resolved' && <ResolvedList />}
        {tab === 'records' && <RecordList />}
      </div>
    </div>
  );
}
