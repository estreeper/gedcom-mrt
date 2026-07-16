import { GedcomLine } from './Line';

// A node in a record's tree: one line plus its lower-level children.
//
// GEDCOM records are hierarchies expressed by the level numbers — a line at
// level N owns the following lines at level N+1 as children.

export interface GedcomNode {
  line: GedcomLine;
  children: GedcomNode[];
  /** Parent node; omitted for a record's level-0 root. Not serialized. */
  parent?: GedcomNode;
}

export function createNode(line: GedcomLine, parent?: GedcomNode): GedcomNode {
  return { line, children: [], parent };
}

/**
 * The logical value of a node, folding its leading CONC/CONT continuation
 * children. CONC appends directly; CONT appends a newline. The CONC/CONT nodes
 * are left in the tree (so the file round-trips); this just reconstructs the
 * value a human authored across them.
 */
export function getFullValue(node: GedcomNode): string {
  let value = node.line.value ?? '';
  for (const child of node.children) {
    const tag = child.line.tag;
    if (tag === 'CONC') {
      value += child.line.value ?? '';
    } else if (tag === 'CONT') {
      value += '\n' + (child.line.value ?? '');
    } else {
      break; // continuation lines only lead; stop at the first real subrecord
    }
  }
  return value;
}

/** Depth-first walk over a node and all its descendants. */
export function walk(node: GedcomNode, visit: (n: GedcomNode) => void): void {
  visit(node);
  for (const child of node.children) walk(child, visit);
}

/** Direct children of `node` carrying the given tag. */
export function childrenWithTag(node: GedcomNode, tag: string): GedcomNode[] {
  return node.children.filter((c) => c.line.tag === tag);
}
