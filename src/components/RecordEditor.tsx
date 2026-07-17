import React, { useState } from 'react';
import { parseText } from '../lib/Parser';
import { GedcomNode, walk } from '../lib/model/Node';
import { GedcomRecord } from '../lib/model/Database';
import { useRepair } from '../state/RepairStore';
import { Pager } from './Pager';

// Structured, per-line editor for a single record. Each GEDCOM line is shown as
// level / xref / tag / value fields with add/remove controls. On save the edited
// rows are re-serialized and re-parsed (reusing the tolerant parser to rebuild
// the record tree), validated, then applied as one atomic, reversible
// ReplaceRecord fix.

interface Row {
  level: string;
  xref: string;
  tag: string;
  value: string;
}

function stripAts(s: string): string {
  let out = s.trim();
  if (out.startsWith('@')) out = out.slice(1);
  if (out.endsWith('@')) out = out.slice(0, -1);
  return out;
}

function flatten(node: GedcomNode, out: Row[]): void {
  out.push({
    level: String(node.line.level),
    xref: node.line.xref ?? '',
    tag: node.line.tag,
    value: node.line.value ?? (node.line.malformed ? node.line.raw : ''),
  });
  node.children.forEach((c) => flatten(c, out));
}

function rowToText(r: Row): string {
  let s = r.level.trim();
  const xref = stripAts(r.xref);
  if (xref) s += ' @' + xref + '@';
  const tag = r.tag.trim();
  if (tag) s += ' ' + tag;
  if (r.value !== '') s += ' ' + r.value;
  return s;
}

function buildRecord(rows: Row[]): GedcomRecord | undefined {
  const text = rows.map(rowToText).join('\n');
  return parseText(text).records[0];
}

/** Validate the edited rows; returns human-readable problems (empty = valid). */
function validateRows(rows: Row[], rebuilt: GedcomRecord | undefined): string[] {
  const problems: string[] = [];
  if (rows.length === 0) {
    problems.push('A record needs at least one line.');
    return problems;
  }
  if (rows[0].level.trim() !== '0') {
    problems.push('The first line must be at level 0 (the record line).');
  }
  rows.forEach((r, i) => {
    if (r.tag.trim() === '') problems.push(`Line ${i + 1} is missing a tag.`);
    else if (!/^\d+$/.test(r.level.trim()))
      problems.push(`Line ${i + 1} has an invalid level "${r.level}".`);
  });
  if (rebuilt) {
    walk(rebuilt.root, (n) => {
      if (n.line.malformed) {
        problems.push(`Could not parse: ${JSON.stringify(rowToText(rowOf(n)))}`);
      }
    });
  }
  return problems;
}

// A malformed rebuilt node carries its original raw; render it back to a Row so
// the error message reads naturally.
function rowOf(n: GedcomNode): Row {
  return {
    level: String(n.line.level),
    xref: n.line.xref ?? '',
    tag: n.line.tag,
    value: n.line.value ?? n.line.raw,
  };
}

export function RecordEditor({ recordId }: { recordId: string }) {
  const { state, dispatch } = useRepair();
  const db = state.db;
  const record = db?.byId.get(recordId);

  const [rows, setRows] = useState<Row[]>(() => {
    const out: Row[] = [];
    if (record) flatten(record.root, out);
    return out;
  });
  const [errors, setErrors] = useState<string[]>([]);

  if (!db || !record) {
    return (
      <div className="record-editor">
        <p className="error">Record @{recordId}@ no longer exists.</p>
        <button onClick={() => dispatch({ type: 'CLOSE_EDITOR' })}>Close</button>
      </div>
    );
  }

  // Prev/next navigation across all records that have an id.
  const records = db.records.filter((r) => r.id !== undefined);
  const recIdx = records.findIndex((r) => r.id === recordId);
  const goRecord = (delta: number) => {
    const next = recIdx + delta;
    if (next < 0 || next >= records.length) return;
    dispatch({ type: 'EDIT_RECORD', id: records[next].id! });
  };

  const update = (i: number, field: keyof Row, val: string) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [field]: val } : r)));

  const removeRow = (i: number) => setRows((rs) => rs.filter((_, j) => j !== i));

  const addRow = () =>
    setRows((rs) => [...rs, { level: '1', xref: '', tag: '', value: '' }]);

  const save = () => {
    const rebuilt = buildRecord(rows);
    const problems = validateRows(rows, rebuilt);
    if (problems.length > 0 || !rebuilt) {
      setErrors(problems.length ? problems : ['Could not build the record.']);
      return;
    }
    setErrors([]);
    dispatch({
      type: 'APPLY_FIX',
      fix: { kind: 'ReplaceRecord', recordId, record: rebuilt },
    });
  };

  const preview = rows.map(rowToText).join('\n');

  return (
    <div className="record-editor">
      <Pager
        index={recIdx}
        total={records.length}
        onPrev={() => goRecord(-1)}
        onNext={() => goRecord(1)}
        label={`Record ${recIdx + 1} of ${records.length}`}
      />

      <h2>
        Edit record @{recordId}@ <span className="issue-meta">({record.type})</span>
      </h2>

      <table className="editor-table">
        <thead>
          <tr>
            <th>Lvl</th>
            <th>Xref</th>
            <th>Tag</th>
            <th>Value</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>
                <input
                  className="cell-level"
                  value={r.level}
                  onChange={(e) => update(i, 'level', e.target.value)}
                />
              </td>
              <td>
                <input
                  className="cell-xref"
                  value={r.xref}
                  onChange={(e) => update(i, 'xref', e.target.value)}
                />
              </td>
              <td>
                <input
                  className="cell-tag"
                  value={r.tag}
                  onChange={(e) => update(i, 'tag', e.target.value)}
                />
              </td>
              <td>
                <input
                  className="cell-value"
                  value={r.value}
                  onChange={(e) => update(i, 'value', e.target.value)}
                />
              </td>
              <td>
                <button
                  className="row-remove"
                  title="Remove line"
                  onClick={() => removeRow(i)}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {errors.length > 0 && (
        <ul className="editor-errors">
          {errors.map((e, i) => (
            <li key={i} className="error">
              {e}
            </li>
          ))}
        </ul>
      )}

      <div className="editor-actions">
        <button onClick={addRow}>+ Add line</button>
        <span className="spacer" />
        <button onClick={() => dispatch({ type: 'CLOSE_EDITOR' })}>Cancel</button>
        <button className="primary" onClick={save}>
          Save
        </button>
      </div>

      <h3>Resulting GEDCOM</h3>
      <pre className="editor-preview">{preview}</pre>
    </div>
  );
}
