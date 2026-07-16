import React from 'react';
import { GedcomDatabase } from '../lib/model/Database';
import { Fix, previewFix } from '../lib/model/Fix';

// A line-level before/after preview of a fix. Uses a naive set difference to
// tint added/removed lines — enough to review a small record edit.

export function FixDiff({ db, fix }: { db: GedcomDatabase; fix: Fix }) {
  let before: string[];
  let after: string[];
  try {
    const preview = previewFix(db, fix);
    before = preview.before ? preview.before.split('\n') : [];
    after = preview.after ? preview.after.split('\n') : [];
  } catch (err) {
    return (
      <p className="error">
        Cannot preview this fix: {err instanceof Error ? err.message : String(err)}
      </p>
    );
  }

  const beforeSet = new Set(before);
  const afterSet = new Set(after);

  return (
    <div className="fix-diff">
      <pre>
        {before
          .filter((l) => !afterSet.has(l))
          .map((l, i) => (
            <div key={`r${i}`} className="diff-removed">
              - {l}
            </div>
          ))}
        {after.map((l, i) => (
          <div key={`a${i}`} className={beforeSet.has(l) ? 'diff-same' : 'diff-added'}>
            {beforeSet.has(l) ? '  ' : '+ '}
            {l}
          </div>
        ))}
      </pre>
    </div>
  );
}
