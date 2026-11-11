# gedcom-mrt

See `ARCHITECTURE.md` for the design, invariants and how to extend; `README.md` for the product.

## Commits

It is okay to commit work in this repo without asking first. Each commit should
cover one self-contained change: a single logical unit that builds and passes
tests on its own, with unrelated changes split into separate commits.

## Commands

Node is pinned in `.tool-versions` (asdf), so bare `node`/`npm`/`npx` work.

```sh
# Frontend (repo root)
npx tsc              # typecheck
npx vitest run       # tests (jsdom)
npm run test:coverage  # coverage report (also available in server/)
npx vite build

# Backend
cd server
npm run typecheck
npm test             # vitest (node)
npm run build
```
