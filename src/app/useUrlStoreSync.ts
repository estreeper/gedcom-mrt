import { useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { parseText } from '../lib/Parser';
import { loadSessionById } from '../lib/idb';
import {
  RepairState,
  SidebarTab,
  IssueFilter,
  SeverityFilter,
  useRepairStore,
} from '../state/RepairStore';

// Keeps the browser URL and the Zustand store in sync so real URLs and the
// back/forward buttons work, WITHOUT making the URL the source of truth for
// rendering. The store still drives what renders; the URL is a mirror.
//
//   store -> URL : whenever the navigation-relevant store fields change, write
//                  the canonical URL into the address bar.
//   URL -> store : whenever the URL changes (back/forward, deep link, a typed
//                  address), apply the matching store actions.
//
// Both directions short-circuit when the two already agree, so they converge in
// a single step instead of looping. A dirty record editor is guarded before the
// URL is allowed to navigate away from it (mirrors useLeaveGuard for in-app
// clicks, which components still handle synchronously themselves).

const TABS: SidebarTab[] = ['issues', 'resolved', 'records'];

/** The single URL that represents a given store state. */
export function canonicalUrl(s: RepairState): string {
  if (!s.fileId) return '/app';
  let path = `/app/file/${encodeURIComponent(s.fileId)}`;
  if (s.editingRecordId) {
    path += `/record/${encodeURIComponent(s.editingRecordId)}`;
  } else if (s.selectedIssueId) {
    path += `/issues/${encodeURIComponent(s.selectedIssueId)}`;
  }
  const q = new URLSearchParams();
  if (s.sidebarTab !== 'issues') q.set('tab', s.sidebarTab);
  if (s.filter !== 'ALL') q.set('filter', s.filter);
  if (s.severityFilter !== 'ALL') q.set('severity', s.severityFilter);
  const qs = q.toString();
  return qs ? `${path}?${qs}` : path;
}

function leaveOk(s: RepairState): boolean {
  return (
    !s.editorDirty ||
    window.confirm('You have unsaved changes to this record. Discard them?')
  );
}

export function useUrlStoreSync(): void {
  const params = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const fileId = params.fileId;
  const issueId = params.issueId;
  const recordId = params.recordId;
  const search = location.search;

  // --- restore on deep-link / file switch ------------------------------------
  // The store holds no db (fresh tab, reload, or a different file). Load the
  // saved session for this fileId; redirect to /app if it isn't found. The ref
  // dedupes React 18 StrictMode's double-invoked effects.
  const restoreRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!fileId) return;
    const s = useRepairStore.getState();
    if (s.db && s.fileId === fileId) return;
    if (restoreRef.current === fileId) return;
    restoreRef.current = fileId;
    loadSessionById(fileId)
      .then((file) => {
        if (!file) {
          navigate('/app', { replace: true });
          return;
        }
        useRepairStore
          .getState()
          .load(parseText(file.text), file.name, true, file.id);
      })
      .catch(() => navigate('/app', { replace: true }))
      .finally(() => {
        if (restoreRef.current === fileId) restoreRef.current = undefined;
      });
  }, [fileId, navigate]);

  // URLs this hook itself navigated to (store -> URL) whose location commit has
  // not been seen yet, oldest first, plus the last such "echo" that was seen.
  // React Router commits a navigation in a transition, so the router location
  // lags the store. When that commit lands, the store was its source and may
  // already have moved on (React 19 can batch the lagging location commit with
  // a newer store change), so URL -> store must not apply it back — doing so
  // would revert the newer store change.
  const selfNavs = useRef<string[]>([]);
  const lastEcho = useRef<string | undefined>(undefined);
  const here = location.pathname + location.search;

  // --- URL -> store ----------------------------------------------------------
  useEffect(() => {
    const echoAt = selfNavs.current.lastIndexOf(here);
    if (echoAt !== -1) {
      selfNavs.current.splice(0, echoAt + 1);
      lastEcho.current = here;
    }
    // (Checked via lastEcho, not just the match above, so StrictMode's
    // double-invoked effect skips both times.)
    if (lastEcho.current === here) return;
    // A URL change that did not come from the store: back/forward, deep link.
    selfNavs.current = [];
    lastEcho.current = undefined;

    const s = useRepairStore.getState();
    if (!s.db || s.fileId !== fileId) return; // not loaded yet; restore handles it

    const query = new URLSearchParams(search);
    const urlTab = (query.get('tab') as SidebarTab) ?? 'issues';
    const urlFilter = (query.get('filter') as IssueFilter) ?? 'ALL';
    const urlSeverityFilter = (query.get('severity') as SeverityFilter) ?? 'ALL';

    if (TABS.includes(urlTab) && s.sidebarTab !== urlTab) s.setSidebarTab(urlTab);
    // setFilter/setSeverityFilter reset the selection, so apply them before
    // selecting an issue.
    if (s.filter !== urlFilter) s.setFilter(urlFilter);
    if (s.severityFilter !== urlSeverityFilter) s.setSeverityFilter(urlSeverityFilter);

    const cur = useRepairStore.getState();
    if (recordId) {
      if (cur.editingRecordId !== recordId) {
        if (leaveOk(cur)) cur.editRecord(recordId);
        else navigate(canonicalUrl(useRepairStore.getState()), { replace: true });
      }
    } else {
      if (cur.editingRecordId) {
        if (leaveOk(cur)) cur.closeEditor();
        else {
          navigate(canonicalUrl(useRepairStore.getState()), { replace: true });
          return;
        }
      }
      const now = useRepairStore.getState();
      if (issueId && now.selectedIssueId !== issueId) now.selectIssue(issueId);
    }
  }, [here, fileId, issueId, recordId, search, navigate]);

  // --- store -> URL ----------------------------------------------------------
  // Reacts to STORE changes only (never to `location`) so it can't fight the
  // URL -> store direction: when the location changes via back/forward, only
  // that effect runs, updates the store, and this effect then confirms the URL
  // already matches. It reads window.location live (rather than depending on it)
  // to compare against the target.
  const state = useRepairStore();
  const lastDb = useRef(state.db);
  useEffect(() => {
    if (state.db) {
      const target = canonicalUrl(state);
      const current = window.location.pathname + window.location.search;
      if (target !== current) {
        // A change that coincides with a new db (a fix was applied) replaces the
        // entry rather than pushing, so accepts don't flood the back-stack;
        // pure navigation pushes so back/forward step through it.
        selfNavs.current.push(target);
        navigate(target, { replace: state.db !== lastDb.current });
      }
    }
    lastDb.current = state.db;
  }, [
    state.db,
    state.fileId,
    state.selectedIssueId,
    state.editingRecordId,
    state.filter,
    state.severityFilter,
    state.sidebarTab,
    navigate,
  ]);
}
