import React, { useCallback, useEffect, useState } from 'react';
import { parseText } from '../lib/Parser';
import { useRepair } from '../state/RepairStore';
import {
  checksum,
  listSessions,
  loadSessionById,
  deleteSession,
  FileMeta,
} from '../lib/idb';
import { isLicensed as isLicensedFn, useLicenseStore } from '../state/LicenseStore';
import { useCloudKeyStore } from '../state/CloudKeyStore';
import { listCloud, loadCloudText, deleteCloud, CloudFileMeta } from '../lib/cloud';
import { UnlockDialog } from '../app/cloud/UnlockDialog';

// Start screen: upload a new GEDCOM file, or re-open a previously-saved one.
// Saved files come from local IndexedDB and (for licensed, unlocked users)
// encrypted cloud storage — merged into one list.

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('File read failed.'));
    reader.readAsText(file);
  });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatWhen(ts: number): string {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return '';
  }
}

interface Row {
  id: string;
  name: string;
  size: number;
  savedAt: number;
  local: boolean;
  cloud: boolean;
}

function mergeRows(local: FileMeta[], cloud: CloudFileMeta[]): Row[] {
  const map = new Map<string, Row>();
  for (const f of local) {
    map.set(f.id, { ...f, local: true, cloud: false });
  }
  for (const f of cloud) {
    const existing = map.get(f.id);
    if (existing) existing.cloud = true;
    else map.set(f.id, { ...f, local: false, cloud: true });
  }
  return [...map.values()].sort((a, b) => b.savedAt - a.savedAt);
}

export function FileLoader() {
  const { dispatch } = useRepair();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<FileMeta[]>([]);
  const [cloud, setCloud] = useState<CloudFileMeta[]>([]);
  const [highlightId, setHighlightId] = useState<string>();
  const [showUnlock, setShowUnlock] = useState(false);

  const licensed = useLicenseStore((s) => isLicensedFn(s));
  const cloudStatus = useCloudKeyStore((s) => s.status);
  const dek = useCloudKeyStore((s) => s.dek);
  const lockCloud = useCloudKeyStore((s) => s.lock);

  const refresh = useCallback(() => {
    listSessions().then(setSaved);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Load the cloud file list once unlocked.
  useEffect(() => {
    if (cloudStatus === 'unlocked' && dek) {
      listCloud(dek)
        .then(setCloud)
        .catch(() => setCloud([]));
    } else {
      setCloud([]);
    }
  }, [cloudStatus, dek]);

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const input = e.target;
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const text = await readFileText(file);
      const id = await checksum(text);

      const existing = await loadSessionById(id);
      if (existing) {
        setNotice(
          `“${file.name}” is already saved as “${existing.name}”. Open it from the list below, or delete it first to start over.`
        );
        setHighlightId(id);
        refresh();
        input.value = '';
        return;
      }

      const db = parseText(text);
      dispatch({ type: 'LOAD', db, name: file.name, id });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const openRow = async (row: Row) => {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      if (row.local) {
        const file = await loadSessionById(row.id);
        if (file) {
          dispatch({ type: 'LOAD', db: parseText(file.text), name: file.name, id: file.id, restored: true });
          return;
        }
      }
      if (row.cloud && dek) {
        const text = await loadCloudText(row.id, dek);
        dispatch({ type: 'LOAD', db: parseText(text), name: row.name, id: row.id, restored: true });
        return;
      }
      setError('That saved file could no longer be found.');
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: Row) => {
    if (row.local) await deleteSession(row.id);
    if (row.cloud) await deleteCloud(row.id).catch(() => {});
    if (highlightId === row.id) {
      setHighlightId(undefined);
      setNotice(undefined);
    }
    refresh();
    if (cloudStatus === 'unlocked' && dek) listCloud(dek).then(setCloud).catch(() => {});
  };

  const rows = mergeRows(saved, cloud);

  return (
    <div className="file-loader">
      <h1>GEDCOM Repair</h1>
      <p>Load a GEDCOM (.ged) file to check it for problems and repair them.</p>
      <input type="file" accept=".ged,.gedcom,text/plain" onChange={onUpload} />
      {busy && <p>Parsing…</p>}
      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      {licensed && (
        <div className="cloud-controls">
          {cloudStatus === 'unlocked' ? (
            <span className="cloud-status">
              ☁ Cloud storage on{' '}
              <button className="linklike" onClick={lockCloud}>
                lock
              </button>
            </span>
          ) : (
            <button className="linklike" onClick={() => setShowUnlock(true)}>
              ☁ Enable / unlock cloud storage
            </button>
          )}
        </div>
      )}

      {rows.length > 0 && (
        <div className="saved-files">
          <h2>Saved files</h2>
          <p className="saved-files-hint">
            Repairs are saved in your browser. Re-open where you left off:
          </p>
          <ul>
            {rows.map((f) => (
              <li
                key={f.id}
                className={`saved-file${f.id === highlightId ? ' highlight' : ''}`}
              >
                <button
                  className="saved-file-open"
                  onClick={() => openRow(f)}
                  disabled={busy}
                >
                  <span className="saved-file-name">
                    {f.name}
                    {f.cloud && (
                      <span className="file-badge" title={f.local ? 'Local + cloud' : 'Cloud only'}>
                        {f.local ? ' ☁' : ' ☁ only'}
                      </span>
                    )}
                  </span>
                  <span className="saved-file-meta">
                    {formatSize(f.size)}
                    {formatWhen(f.savedAt) ? ` · ${formatWhen(f.savedAt)}` : ''}
                  </span>
                </button>
                <button
                  className="saved-file-delete"
                  title={`Delete ${f.name}`}
                  aria-label={`Delete ${f.name}`}
                  onClick={() => remove(f)}
                  disabled={busy}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showUnlock && <UnlockDialog onClose={() => setShowUnlock(false)} />}
    </div>
  );
}
