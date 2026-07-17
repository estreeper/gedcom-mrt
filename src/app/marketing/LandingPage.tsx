import React from 'react';
import { Link } from 'react-router-dom';
import './LandingPage.css';

// Marketing landing page shown at `/`. Explains the tool to prospective
// customers and routes them into the free checker (`/app`). The value props are
// drawn from README.md / ARCHITECTURE.md.

const FEATURES: { title: string; body: string }[] = [
  {
    title: 'Opens files other tools reject',
    body: 'A tolerant parser that never chokes: malformed lines, unknown tags, odd line endings and missing records are all kept as data so the file can be inspected and repaired instead of refused.',
  },
  {
    title: 'Finds broken family links',
    body: 'The flagship check catches one-way links — a family that lists a child, spouse or parent whose own record has no matching pointer back — plus pointers to records that don’t exist.',
  },
  {
    title: 'Every fix is reviewable',
    body: 'See a precise before/after diff for each suggested repair. Nothing changes until you accept it, and every change can be undone.',
  },
  {
    title: 'Keeps your file faithful',
    body: 'Records you don’t touch are preserved exactly, byte for byte. Only the lines involved in a fix you accept are ever rewritten.',
  },
  {
    title: 'Runs in your browser',
    body: 'Parsing, validation and repair all happen locally on your device. Your genealogy file is never uploaded just to be checked.',
  },
  {
    title: 'Built for big files',
    body: 'Virtualized lists and batched bulk repairs keep files with tens of thousands of records and issues responsive.',
  },
];

const STEPS = ['Load', 'Validate', 'Review', 'Edit', 'Export'];

const FAQ: { q: string; a: string }[] = [
  {
    q: 'What does “apply repairs” mean?',
    a: 'Checking your file and seeing exactly what’s wrong — including the suggested fix and its diff — is free. A license unlocks actually applying those fixes and exporting the corrected GEDCOM.',
  },
  {
    q: 'Which GEDCOM versions are supported?',
    a: 'The parser deliberately tolerates a broad range of real-world dialects (roughly 5.3 through 5.5.5) and vendor extensions, because the whole point is repairing damaged and legacy files. GEDCOM 7.0 is out of scope for now.',
  },
  {
    q: 'Is the license a subscription?',
    a: 'No. It’s a one-time purchase of $35 that grants a full year of access. There’s a money-back guarantee if it doesn’t work for you.',
  },
  {
    q: 'Do you store my file?',
    a: 'Only if you opt in to cloud storage — and then only as ciphertext we cannot read. Your browser holds the key; we just hand the encrypted blob back to you. Otherwise nothing leaves your device.',
  },
];

export function LandingPage() {
  return (
    <div className="landing">
      <header className="landing-nav">
        <span className="landing-logo">GEDCOM Repair</span>
        <nav>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
          <Link className="nav-cta" to="/app">
            Open the app
          </Link>
        </nav>
      </header>

      <section className="hero">
        <h1>Open, diagnose, and repair broken GEDCOM files that other tools reject.</h1>
        <p className="hero-sub">
          A bad export, a hand-edit, or an old program can break the links between
          people and families in your genealogy file. GEDCOM Repair opens the
          broken file, tells you exactly what’s wrong, and helps you fix it — with
          you reviewing every change.
        </p>
        <div className="hero-cta">
          <Link className="btn btn-primary" to="/app">
            Check your file — free
          </Link>
          <a className="btn btn-ghost" href="#pricing">
            See pricing
          </a>
        </div>
        <p className="hero-note">
          Checking is free and runs entirely in your browser. No account needed.
        </p>
      </section>

      <section className="how">
        <h2>How it works</h2>
        <ol className="steps">
          {STEPS.map((s, i) => (
            <li key={s}>
              <span className="step-n">{i + 1}</span>
              <span className="step-label">{s}</span>
            </li>
          ))}
        </ol>
        <p className="how-sub">
          Load a <code>.ged</code> file, let the rule engine list the problems,
          review each one with a diff, edit by hand where needed, and export the
          repaired file.
        </p>
      </section>

      <section className="features">
        <h2>What it does</h2>
        <div className="feature-grid">
          {FEATURES.map((f) => (
            <div key={f.title} className="feature-card">
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="compare">
        <h2>Free vs. licensed</h2>
        <table className="compare-table">
          <thead>
            <tr>
              <th>Capability</th>
              <th>Free</th>
              <th>Licensed</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Upload &amp; parse any GEDCOM', true, true],
              ['See every detected issue', true, true],
              ['Preview the suggested fix &amp; diff', true, true],
              ['Browse and search records', true, true],
              ['Apply fixes (single &amp; bulk)', false, true],
              ['Edit records by hand and save', false, true],
              ['Export the repaired GEDCOM', false, true],
              ['Encrypted cloud storage of your files', false, true],
            ].map(([label, free, paid]) => (
              <tr key={label as string}>
                <td dangerouslySetInnerHTML={{ __html: label as string }} />
                <td className={free ? 'yes' : 'no'}>{free ? '✓' : '—'}</td>
                <td className={paid ? 'yes' : 'no'}>{paid ? '✓' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="pricing" id="pricing">
        <h2>Pricing</h2>
        <div className="price-card">
          <div className="price-amount">
            <span className="price-currency">$</span>35
          </div>
          <p className="price-term">one-time · one year of access</p>
          <ul className="price-list">
            <li>Apply single and bulk repairs</li>
            <li>Manual record editing</li>
            <li>Export repaired GEDCOM files</li>
            <li>Optional zero-knowledge cloud storage</li>
          </ul>
          <Link className="btn btn-primary btn-block" to="/app">
            Get started
          </Link>
          <p className="guarantee">
            30-day money-back guarantee — if it doesn’t fix your file, you don’t pay.
          </p>
        </div>
      </section>

      <section className="privacy">
        <h2>Your data stays yours</h2>
        <p>
          The app processes your file locally in the browser. If you choose to
          store files in the cloud so you can pick up on another device, they’re
          encrypted on your device first — we only ever hold ciphertext we can’t
          read, and the key never leaves your browser.
        </p>
      </section>

      <section className="faq" id="faq">
        <h2>Questions</h2>
        <div className="faq-list">
          {FAQ.map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="landing-footer">
        <span>GEDCOM Repair</span>
        <Link to="/app">Open the app</Link>
      </footer>
    </div>
  );
}
