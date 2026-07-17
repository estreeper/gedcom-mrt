# gedcom-mrt — GEDCOM Repair Tool

A tool for **examining damaged GEDCOM genealogy files and repairing them**, with a
human in the loop for every change.

Genealogy data is often exchanged as [GEDCOM](https://www.gedcom.org/gedcom.html)
files, and those files get corrupted: a bad export, a hand-edit, or an old
program can break the pointers that link people to their families, leave lines
malformed, or drop records entirely. Many tools simply refuse to open a file
like that. This tool is built for the opposite job — it opens the broken file,
tells you what's wrong, and helps you fix it.

## What it does

- **Parses tolerantly.** The parser never throws. Malformed lines, unknown tags,
  odd line endings, missing records — all are captured as data so the file can
  still be inspected and repaired rather than rejected.
- **Validates and finds issues.** A rule engine scans the parsed file and
  produces a list of concrete problems — most importantly **broken linkages
  between individuals (`INDI`) and families (`FAM`)**.
- **Suggests reviewable fixes.** When the correct data can be reconstructed (for
  example, a family lists a child but the child has no matching link back to the
  family), the tool proposes a fix and shows you a before/after diff. Nothing is
  applied until you accept it.
- **Lets you edit by hand.** When a problem can't be reconstructed
  automatically, you can edit the record directly.
- **Exports a corrected file.** Repairs are re-serialized back to GEDCOM.
  Records you didn't touch are preserved exactly as they came in — only the
  lines involved in an accepted fix change.

Every fix is **reviewable, applyable, and reversible** (undo/redo).

## How it works

```
Load  →  Validate  →  Review  →  Edit  →  Export
```

1. **Load** a `.ged` file. It's tokenized (level, xref, tag, value), assembled
   into a per-record tree, and indexed by id and type.
2. **Validate** runs the rule engine and lists issues by severity.
3. **Review** an issue to see the records involved and any suggested fix as a
   line-level diff; accept or reject it.
4. **Edit** records manually where no suggestion is possible.
5. **Export** the repaired GEDCOM.

## Issues detected today

- **Dangling pointers** — a `FAMC`/`FAMS`/`HUSB`/`WIFE`/`CHIL`/etc. pointer to a
  record that doesn't exist. Suggested fixes: remove the offending line, or
  create a stub record to point at.
- **Asymmetric (one-way) family links** — the flagship check. A `FAM` that lists
  a `CHIL`/`HUSB`/`WIFE` whose `INDI` has no matching `FAMC`/`FAMS` back-pointer
  (and vice-versa). Suggested fix: add the reciprocal line.

Parsing also records structural notes (duplicate xrefs, bad level nesting,
malformed lines) that later milestones surface as first-class issues.

## GEDCOM versions

This tool is based on the GEDCOM specification. Useful references:

- The spec and its versions: <https://www.gedcom.org/gedcom.html>
- Notes on the many versions and their quirks:
  <https://www.gedcom.org/versions.html>

The built-in tag dictionary (`src/lib/GedcomTags.ts`) is drawn from **GEDCOM
5.5.1** (1999), the long-time interchange standard. **5.5.5** (2019) is the
stricter current standard on gedcom.org. Because the whole point is repairing
damaged and legacy files, the parser deliberately **tolerates a broad range of
real-world dialects (roughly 5.3 through 5.5.5)** and non-standard vendor
extensions rather than enforcing a single version. FamilySearch's later GEDCOM
7.0 is out of scope for now.

## Project layout

Domain logic is kept separate from the React UI:

```
src/
  lib/                 GEDCOM domain logic (no React)
    model/
      Line.ts          tolerant line tokenizer (hand-written scanner)
      Node.ts          record tree + CONC/CONT handling
      Database.ts      typed record collection, indexes
      Serialize.ts     faithful round-trip back to GEDCOM text
      Issue.ts         validation finding types
      Fix.ts           reviewable/reversible edit operations
    Parser.ts          text → GedcomDatabase
    Validator.ts       rule engine → Issue[]
    Describe.ts        record ids → human-readable names/descriptions
    GedcomTags.ts      GEDCOM 5.5.1 tag dictionary
    idb.ts             IndexedDB autosave of the working session
  state/
    RepairStore.tsx    Zustand store (db, issues, undo/redo) + autosave/restore
  components/          FileLoader, Sidebar, IssueList, IssueDetail, FixDiff,
                       RecordList, RecordEditor, ExportBar, VirtualList
  App.tsx              application shell
```

The parsed GEDCOM lives entirely in memory as a `GedcomDatabase` (a tree of
records). The working session is **autosaved to IndexedDB** (the serialized,
repaired text — not the node tree) so a reload restores where you left off;
long lists are **virtualized** (`react-window`) so files with tens of thousands
of records/issues stay responsive.

## Roadmap

- **Now:** tolerant parser + faithful round-trip; dangling-pointer and
  one-way-family-link detection; review-and-accept UI (single and bulk); a
  record browser and a structured manual record editor; undo/redo; virtualized
  lists and IndexedDB session persistence for large files; export.
- **Next:** more rules (orphan individuals, missing required subrecords such as
  a name, unknown tags, duplicate xrefs, bad level nesting, missing
  header/trailer) and a summary dashboard.
- **Later:** moving parse/validate to a Web Worker for very large files, and
  character-encoding fidelity.

## Getting started

Requires Node.js (18+). Install dependencies, then:

```sh
npm start      # run the app in development at http://localhost:3000
npm test       # run the unit and component tests
npm run build  # produce an optimized production build in ./build
```

The domain layer under `src/lib` is pure and framework-free, so most of the
logic is covered by fast unit tests (tokenizer, parser round-trip, each
validator rule, and fix application/inversion).
