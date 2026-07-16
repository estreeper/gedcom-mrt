// A single tokenized GEDCOM line.
//
// GEDCOM lines have the shape:  LEVEL [@XREF@] TAG [value]
// e.g.  "0 @I5@ INDI"  or  "1 FAMC @F3@"  or  "2 DATE 12 JAN 1900"
//
// Parsing is done with an explicit left-to-right scanner rather than a
// compound regular expression: damaged files are the normal input here, and a
// hand-written scanner keeps the tolerant / error-reporting paths readable.

export interface GedcomLine {
  /** 1-based line number in the source file. */
  lineNumber: number;
  /** The original line text, verbatim (without its trailing newline). */
  raw: string;
  /** The level number, or -1 if the line had no leading number. */
  level: number;
  /** Record identifier from a leading `@ID@` (stored without the `@`s). */
  xref?: string;
  /** The tag (e.g. INDI, FAMC, NAME); "" when the line is malformed. */
  tag: string;
  /** Everything after the tag's delimiter space; may be undefined. */
  value?: string;
  /** Target id when `value` is exactly a single `@ID@` pointer (no `@`s). */
  pointer?: string;
  /** True when the line did not match the GEDCOM grammar. */
  malformed: boolean;
  /**
   * Set by fix operations on lines that were created or edited. When true the
   * serializer re-renders the line from its structured fields instead of
   * emitting `raw`, so untouched lines round-trip byte-for-byte.
   */
  dirty?: boolean;
}

function isDigit(c: string): boolean {
  return c >= '0' && c <= '9';
}

function isSpace(c: string): boolean {
  return c === ' ' || c === '\t';
}

/**
 * Tokenize one raw line into a GedcomLine. Never throws: anything that does not
 * fit the grammar is returned with `malformed: true` and `raw` preserved so it
 * can still be displayed, round-tripped, and hand-edited.
 */
export function tokenizeLine(raw: string, lineNumber: number): GedcomLine {
  const malformed = (level: number, xref?: string): GedcomLine => ({
    lineNumber,
    raw,
    level,
    xref,
    tag: '',
    malformed: true,
  });

  const len = raw.length;
  let i = 0;

  // Leading whitespace is illegal in GEDCOM but appears in the wild; skip it.
  while (i < len && isSpace(raw[i])) i++;

  // Level: one or more digits.
  const levelStart = i;
  while (i < len && isDigit(raw[i])) i++;
  if (i === levelStart) return malformed(-1);
  const level = parseInt(raw.slice(levelStart, i), 10);

  // The level must be followed by a delimiter (or end of line).
  if (i < len && !isSpace(raw[i])) return malformed(level);
  while (i < len && isSpace(raw[i])) i++;

  // Optional record xref: @ID@ immediately after the level.
  let xref: string | undefined;
  if (i < len && raw[i] === '@') {
    const xrefStart = i + 1;
    let j = xrefStart;
    while (j < len && raw[j] !== '@') j++;
    if (j >= len) return malformed(level); // unterminated @…
    xref = raw.slice(xrefStart, j);
    i = j + 1;
    while (i < len && isSpace(raw[i])) i++;
  }

  // Tag: runs up to the next delimiter or end of line.
  const tagStart = i;
  while (i < len && !isSpace(raw[i])) i++;
  const tag = raw.slice(tagStart, i);
  if (tag === '') return malformed(level, xref);

  // Value: everything after a single delimiter space following the tag.
  let value: string | undefined;
  if (i < len) {
    i++; // consume the one delimiter char
    value = raw.slice(i);
  }

  // Pointer: the value is exactly a single @ID@ token.
  let pointer: string | undefined;
  if (
    value !== undefined &&
    value.length >= 3 &&
    value[0] === '@' &&
    value[value.length - 1] === '@'
  ) {
    const inner = value.slice(1, value.length - 1);
    if (inner.length > 0 && inner.indexOf('@') === -1) pointer = inner;
  }

  return { lineNumber, raw, level, xref, tag, value, pointer, malformed: false };
}
