# Slotwise

A local, multi-workspace room-booking demo built with TypeScript, Node.js and SQLite.

**Status: milestone 1, working backend and a lightweight browser interface.** This is a foundation to develop together in VS Code, not a finished production service.

The interface was redesigned as **The booking desk** on 18 October 2026: original schematic room drawings, a timetable grid and a reservation slip in warm paper, charcoal and rust. See `DESIGN.md` to apply this frontend update to an existing local project.

## Run in VS Code

Install Node.js 24.12 or later within the 24.x release line and open this folder in VS Code.

```bash
node --version
npm start
```

Open http://localhost:3000. Runtime and tests need no downloaded packages. To install the development tooling and check types:

```bash
npm ci
npm run typecheck
npm test
```

Node executes the TypeScript by stripping types; execution itself does not type-check the code. `tsc` is a separate check. The browser client currently uses plain JavaScript; a React/TypeScript client is a later milestone.

Data is written to `data/slotwise.sqlite`. Shut the app down before removing that directory to reset the demo. `SLOTWISE_DB` changes the database path; `PORT` changes the port. The server binds to localhost.

## What to try

1. As Alice, reserve the Focus room for tomorrow at 09:00.
2. Switch to Bob and observe that the same time is unavailable. Bob sees his own reservations.
3. Switch to Carol: only South Studio resources are available.
4. Switch back to Alice and cancel. Bob can now reserve that time.
5. Run `npm test`: the race test uses two workers with separate SQLite connections competing for the same interval.

## Implemented behavior

- Prepared SQL statements and durable SQLite storage.
- Atomic overlap check and booking creation using `BEGIN IMMEDIATE`.
- Half-open intervals: a booking ending at 10:00 permits the next one starting at 10:00.
- Actor-scoped idempotency keys; equivalent timezone representations normalize to the same request fingerprint.
- Same key and request returns the current booking; changed content with the same key returns 409.
- Cancellation releases the interval and creates one audit event, even if repeated.
- Organization-scoped resources; user-scoped reservations and activity.
- Explicit timezone validation, real calendar dates, future reservations, 15-minute to 4-hour duration, 30-day horizon.
- API error codes, request IDs, structured request logs and bounded JSON payloads.
- GitHub Actions configuration for type-checking and automated tests on pushes and pull requests.
- Dubai time display, loading and empty states, mobile layout, accessible native buttons and inputs.

## Demo identity

**The account selector and fixed tokens are demo identities, not real authentication.** Anyone with the demo code can select any account. Workspace checks demonstrate scoping after an actor is selected; they do not secure a public service.

| Token | User | Workspace |
| --- | --- | --- |
| `demo-alice` | Alice | North Studio |
| `demo-bob` | Bob | North Studio |
| `demo-carol` | Carol | South Studio |

## API

All `/api/*` routes require `Authorization: Bearer <demo-token>`. Booking creation also requires `Content-Type: application/json` and `Idempotency-Key` (8–100 allowed characters).

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Process health and demo mode |
| GET | `/api/me` | Current demo identity |
| GET | `/api/resources` | Workspace resources |
| GET | `/api/resources/:id/availability` | Future occupied intervals, without user identities |
| GET | `/api/bookings` | Current user's bookings |
| POST | `/api/bookings` | Reserve an interval; 201 new, 200 replay, 409 conflict |
| POST | `/api/bookings/:id/cancel` | Cancel the current user's reservation |
| GET | `/api/activity` | Current user's last 20 audit events |

Creation body:

```json
{
  "resourceId": "focus-room",
  "startsAt": "2026-10-10T09:00:00+04:00",
  "endsAt": "2026-10-10T10:00:00+04:00"
}
```

Use dates in the future when running the app. This static example describes the format.

## Files to understand first

- `src/domain.ts`: input validation and domain types.
- `src/store.ts`: schema, transactions, booking rules, cancellation, scoping.
- `src/app.ts`: HTTP routing and error responses.
- `tests/store.test.ts`: business rules and a real cross-worker race.
- `tests/api.test.ts`: end-to-end HTTP requests against a running test server.
- `public/`: the demo client.

## Design decisions

SQLite and a synchronous API keep the first milestone easy to run and inspect. The writer transaction prevents two connections from both approving an overlap before insertion. It serializes writes across the whole database, so this is not evidence of high throughput. A single-server Node loop also serializes synchronous work; the independent-worker test exercises the database locking beyond that loop.

Availability is only a preview. The server always rechecks the interval during the transaction. Browser retries preserve the idempotency key after an uncertain network result.

Resources have one simultaneous reservation regardless of room capacity. Capacity means number of people who can use the reserved room, not independent bookable seats.

## Next milestones to build together

1. Read and modify the transaction and tests in VS Code; add rescheduling without releasing the original reservation on failure.
2. Add a React/TypeScript client with component and browser tests.
3. Move to PostgreSQL, versioned migrations and database-enforced interval exclusion constraints; test concurrent writes again.
4. Replace demo identities with real sessions, organization membership and roles; add appropriate request protection and rate limits.
5. Add pagination, structured metrics, container setup, CI and deployment with durable storage.
6. Record a short demo, publish the GitHub repository and write a case study with measured results.

Current limitations: create-if-absent schema setup rather than versioned migrations; no real authentication; no browser automation verification yet; unpaginated bookings and availability; no retention policy for idempotency/audit records; no retry response for database contention timeouts; no public deployment. The GitHub Actions workflow has not run remotely yet. Do not describe unbuilt features or unmeasured performance as completed work.

## Interview questions to practice

- Why must the overlap check happen after the transaction begins?
- Why does application-only validation become difficult across multiple server replicas?
- What should a client do if the request succeeded but the response was lost?
- Why are both organization and user checks required?
- What changes when the database becomes PostgreSQL?
- Why store an absolute timestamp and display it in a chosen timezone?

Use AI to help build, then learn to explain, debug and modify every part you present.

## References

- Node TypeScript execution: https://nodejs.org/docs/latest-v24.x/api/typescript.html
- Node SQLite API: https://nodejs.org/docs/latest-v24.x/api/sqlite.html
