# Milestone 1 verification

Verified in the build environment on 9 October 2026:

- Node.js v24.19.0.
- TypeScript 5.9.3 and @types/node 24.19.1 installed; package-lock.json included.
- `npm run typecheck`: passed.
- `npm test`: seven tests passed, no failures.
- `node --check public/app.js`: passed.
- The HTTP test checks the served page and real API calls.
- The race test uses independent workers and separate database connections; one wins, one receives SLOT_TAKEN, and only one active row remains.

Not yet verified: interactive browser behavior, visual layout in a real browser, browser accessibility audits, load benchmarks, PostgreSQL behavior, or GitHub-hosted workflow execution. No public deployment or GitHub repository has been created by this starter.

## Booking desk redesign — 18 October 2026

- `npm run typecheck`: passed.
- `npm test`: seven tests passed; the page-content assertion now checks the redesigned heading.
- `node --check public/app.js`: passed.
- Additional one-off DOM checks with jsdom against the real local HTTP API passed: initial room drawings, selected room label, nine time slots, booking creation, availability after creation, cancellation, Alice/Bob account switching, Carol's separate workspace and activity rendering. No DOM runtime errors were reported. The jsdom checking harness is build-environment tooling, not an added project dependency or browser test.
- All JavaScript element IDs resolve in the new HTML; no duplicate HTML IDs.

Visual rendering and browser interaction were not verified: the available cloud browser cannot access this local application or its shared file preview under the current URL policy. A browser engine download was also unavailable. Verify appearance, narrow layouts and keyboard focus in the local browser using the checklist in `DESIGN.md`.
