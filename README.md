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
- **Validates and finds issues — both damage and data-entry mistakes.** A rule
  engine scans the parsed file for two different kinds of problem: **broken
  linkages** between individuals (`INDI`) and families (`FAM`) — the fingerprint
  of a corrupted export or hand-edit — and **data that's valid GEDCOM but almost
  certainly wrong**, like a death recorded before a birth or a marriage at age
  8. Every finding is tagged with one of four tiers (see below) so you know at a
  glance whether something is definitely broken, definitely impossible, merely
  improbable, or just worth a look.
- **Suggests reviewable fixes.** When the correct data can be reconstructed (for
  example, a family lists a child but the child has no matching link back to the
  family), the tool proposes a fix and shows you a before/after diff. Nothing is
  applied until you accept it.
- **Offers a quick, guided correction when there's no safe auto-fix.** Dates
  that are impossible or improbable are never silently deleted — instead the
  issue shows a plain-language field (e.g. "Birth date") pre-filled with the
  current value, so you can correct or clear it in place without leaving the
  issue view.
- **Lets you edit by hand.** When a problem can't be reconstructed
  automatically or quick-corrected, you can edit the record directly in a
  structured, per-line editor.
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
2. **Validate** runs the rule engine and lists issues, worst tier first.
3. **Review** an issue to see the records involved, any suggested fix as a
   line-level diff, or (for issues with no safe auto-fix) an inline quick-edit
   field; accept, quick-correct, or reject it.
4. **Edit** records manually where neither a suggestion nor a quick edit fits.
5. **Export** the repaired GEDCOM.

## Issues detected today

Every issue is tagged with one of four tiers, so the UI can tell you *how
confident* the tool is that something is actually wrong, not just how severe it
looks:

| Tier | Meaning | Examples |
|---|---|---|
| 🔴 **Invalid** | The file itself is damaged — not something anyone typed on purpose. | Dangling pointers, one-way family links, malformed lines, bad level nesting, duplicate record ids, a missing header/trailer. |
| 🟠 **Error** | Valid GEDCOM, but the data is **logically impossible** — it cannot ever be correct. | Death before birth, a birth/death/marriage date in the future, marriage after death or before birth, a parent born after their child, a lifespan over 123 years, a burial before death. |
| 🟡 **Likely error** | Valid and possible, but statistically **improbable** — usually a mistake. | A marriage under age 12, overlapping ("plural") marriages with no recorded divorce or death in between, an implausibly young or old parent. |
| 🔵 **Possible issue** | Incomplete or otherwise worth a look, but often legitimate. | No birth or death recorded, a family with no children, no source citations, likely-duplicate individuals (same name and birth year), an individual not linked to any family. |

Structural checks (🔴 Invalid):

- **Dangling pointers** — a `FAMC`/`FAMS`/`HUSB`/`WIFE`/`CHIL`/etc. pointer to a
  record that doesn't exist. Suggested fixes: remove the offending line, or
  create a stub record to point at.
- **Asymmetric (one-way) family links** — a `FAM` that lists a `CHIL`/`HUSB`/
  `WIFE` whose `INDI` has no matching `FAMC`/`FAMS` back-pointer (and
  vice-versa). Suggested fix: add the reciprocal line.
- **Circular ancestry** — someone listed as their own ancestor (or their own
  parent/spouse), found by walking the `FAMC`/`HUSB`/`WIFE` graph.
- Parser-noticed damage — duplicate xrefs, bad level nesting, malformed lines,
  a missing `HEAD`/`TRLR` — surfaced as first-class issues.

The 🟠/🟡/🔵 checks above have **no automatic fix** — the tool never deletes a
genealogical date or record on your behalf. Instead, where the exact field is
known, the issue offers an inline **quick edit**: a plain-language label (e.g.
"Death date") pre-filled with the current value, so you can correct or clear it
without opening the full record editor. Everything else falls back to the
manual editor.

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
      Issue.ts         validation finding types (Severity tiers, quickEdit)
      Fix.ts           reviewable/reversible edit operations
      GedcomDate.ts    tolerant GEDCOM DATE parser + conservative comparisons
    rules/             semantic ("valid but wrong") validation rules
      accessors.ts     shared field accessors (events, dates, family members)
      dates.ts         logically-impossible dates (tier: error)
      relationships.ts improbable relationships (tier: warning)
      missing.ts       incomplete/suspect data (tier: info)
      structural.ts    circular ancestry, duplicates, orphans
      parseNotes.ts    surfaces parser-noticed damage as issues (tier: invalid)
    Parser.ts          text → GedcomDatabase
    Validator.ts       rule engine → Issue[] (composes Validator's own
                       structural rules with everything under rules/)
    Describe.ts        record ids → human-readable names/descriptions
    GedcomTags.ts      GEDCOM 5.5.1 tag dictionary
    idb.ts             IndexedDB autosave of the working session
  state/
    RepairStore.tsx    Zustand store (db, issues, undo/redo) + autosave/restore
  components/          FileLoader, Sidebar, IssueList, IssueDetail, FixDiff,
                       QuickEdit, RecordList, RecordEditor, ExportBar,
                       VirtualList
  App.tsx              application shell
```

The parsed GEDCOM lives entirely in memory as a `GedcomDatabase` (a tree of
records). Each file you work on is **autosaved to IndexedDB** (the serialized,
repaired text — not the node tree, keyed by filename) and listed on the start
screen so you can re-open a previous file or upload a new one. Long lists are
**virtualized** (`react-window`) so files with tens of thousands of
records/issues stay responsive.

## Roadmap

- **Now:** tolerant parser + faithful round-trip; four-tier issue detection
  spanning structural damage (dangling pointers, one-way family links, circular
  ancestry, parser-noticed damage), impossible dates, improbable relationships,
  and incomplete/suspect data; review-and-accept UI (single and bulk) plus an
  inline quick-edit for issues with no safe auto-fix; a record browser and a
  structured manual record editor; undo/redo; virtualized lists and IndexedDB
  session persistence for large files; export.
- **Next:** missing required subrecords (e.g. a name), unknown-tag detection,
  and a summary dashboard.
- **Later:** moving parse/validate to a Web Worker for very large files, and
  character-encoding fidelity.

## Pricing

Checking a file and previewing every fix is **free** and runs entirely in your
browser. **Applying repairs and exporting** the corrected file require a
license: **$35 one-time, one year of access, 30-day money-back guarantee.**
Optional **zero-knowledge cloud storage** lets you pick up on another device —
files are encrypted on your device first, so the server only ever holds
ciphertext it can't read.

## Getting started

Requires Node.js (20+). The frontend lives at the repo root; the backend is in
`server/`.

```sh
# Frontend (repo root) — Vite + Vitest
npm install
npm start        # dev server at http://localhost:3000 (proxies /api to the backend)
npx vitest run   # run the unit and component tests
npm run build    # typecheck + optimized production build in ./build

# Backend (accounts, Stripe licensing, encrypted file storage)
npm --prefix server install
npm --prefix server run dev    # Fastify on :8080 with an in-memory store
npm --prefix server test

# Production shape: one container serves the SPA + API
docker build -t gedcom-mrt .
```

The domain layer under `src/lib` is pure and framework-free, so most of the
logic is covered by fast unit tests (tokenizer, parser round-trip, each
validator rule, fix application/inversion, and the zero-knowledge crypto).

## Architecture & deployment

The app is a React SPA (Vite) plus a minimal Fastify backend; all GEDCOM
processing stays in the browser. It deploys as a single container to **Cloud
Run** (one GCP project per environment) via **Terraform + GitHub Actions**. See
[ARCHITECTURE.md](ARCHITECTURE.md) for the design and [infra/](infra/) for the
infrastructure and CI/CD.
