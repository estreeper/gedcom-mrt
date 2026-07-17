import React, { useCallback, useEffect, useState } from 'react';
import { parse, parseText } from '../lib/Parser';
import { useRepair } from '../state/RepairStore';
import {
  listSessions,
  loadSessionByName,
  deleteSession,
  FileMeta,
} from '../lib/idb';

// Start screen: upload a new GEDCOM file, or re-open a previously-saved one.

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

export function FileLoader() {
  const { dispatch } = useRepair();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<FileMeta[]>([]);

  const refresh = useCallback(() => {
    listSessions().then(setSaved);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(undefined);
    try {
      const db = await parse(file);
      dispatch({ type: 'LOAD', db, name: file.name });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const openSaved = async (name: string) => {
    setBusy(true);
    setError(undefined);
    try {
      const file = await loadSessionByName(name);
      if (!file) {
        setError('That saved file could no longer be found.');
        refresh();
        return;
      }
      const db = parseText(file.text);
      dispatch({ type: 'LOAD', db, name: file.name, restored: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (name: string) => {
    await deleteSession(name);
    refresh();
  };

  return (
    <div className="file-loader">
      <h1>GEDCOM Repair</h1>
      <p>Load a GEDCOM (.ged) file to check it for problems and repair them.</p>
      <input type="file" accept=".ged,.gedcom,text/plain" onChange={onUpload} />
      {busy && <p>Parsing…</p>}
      {error && <p className="error">{error}</p>}

      {saved.length > 0 && (
        <div className="saved-files">
          <h2>Saved files</h2>
          <p className="saved-files-hint">
            Repairs are saved in your browser. Re-open where you left off:
          </p>
          <ul>
            {saved.map((f) => (
              <li key={f.name} className="saved-file">
                <button
                  className="saved-file-open"
                  onClick={() => openSaved(f.name)}
                  disabled={busy}
                >
                  <span className="saved-file-name">{f.name}</span>
                  <span className="saved-file-meta">
                    {formatSize(f.size)}
                    {formatWhen(f.savedAt) ? ` · ${formatWhen(f.savedAt)}` : ''}
                  </span>
                </button>
                <button
                  className="saved-file-delete"
                  title={`Delete ${f.name}`}
                  aria-label={`Delete ${f.name}`}
                  onClick={() => remove(f.name)}
                  disabled={busy}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
