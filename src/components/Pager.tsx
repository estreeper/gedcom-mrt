import React from 'react';

// Grouped previous/next navigation shown at the top of a viewer pane. The two
// buttons sit next to each other; a button is hidden (not disabled) at the
// corresponding end of the range.

export function Pager({
  index,
  total,
  onPrev,
  onNext,
  label,
}: {
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  label: string;
}) {
  if (total <= 1 || index < 0) return null;

  return (
    <div className="pager">
      <div className="pager-buttons">
        {index > 0 && (
          <button className="pager-btn" onClick={onPrev}>
            ← Previous
          </button>
        )}
        {index < total - 1 && (
          <button className="pager-btn" onClick={onNext}>
            Next →
          </button>
        )}
      </div>
      <span className="pager-pos">{label}</span>
    </div>
  );
}
