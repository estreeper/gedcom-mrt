import React from 'react';
import { List, RowComponentProps } from 'react-window';

// Renders a long list efficiently: below the threshold it renders every row
// (cheap, and keeps tests/small files simple); above it, react-window
// virtualizes so only the on-screen rows hit the DOM. Rows are fixed-height.

const VIRTUALIZE_OVER = 100;

interface RowData {
  render: (index: number, style?: React.CSSProperties) => React.ReactNode;
}

function Row({ index, style, render }: RowComponentProps<RowData>) {
  return <>{render(index, style)}</>;
}

export function VirtualList({
  count,
  rowHeight,
  className,
  render,
}: {
  count: number;
  rowHeight: number;
  className?: string;
  render: (index: number, style?: React.CSSProperties) => React.ReactNode;
}) {
  if (count <= VIRTUALIZE_OVER) {
    return (
      <div className={`vlist-plain ${className ?? ''}`}>
        {Array.from({ length: count }, (_, i) => render(i))}
      </div>
    );
  }

  return (
    <List
      className={`vlist ${className ?? ''}`}
      rowComponent={Row}
      rowCount={count}
      rowHeight={rowHeight}
      rowProps={{ render }}
    />
  );
}
