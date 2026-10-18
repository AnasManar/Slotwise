import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { Store, DEMO_ACTORS } from '../src/store.ts';
import { AppError } from '../src/domain.ts';

const now = Date.parse('2026-10-09T08:00:00Z');
const alice = DEMO_ACTORS['demo-alice'];
const bob = DEMO_ACTORS['demo-bob'];
const carol = DEMO_ACTORS['demo-carol'];
const input = { resourceId: 'focus-room', startsAt: '2026-10-10T09:00:00+04:00', endsAt: '2026-10-10T10:00:00+04:00' };
function code(expected: string) { return (error: unknown) => error instanceof AppError && error.code === expected; }

test('overlaps fail, adjacent intervals succeed, and cancellation releases capacity', () => {
  const store = new Store(':memory:', () => now);
  try {
    const first = store.book(alice, input, 'first-request').booking;
    assert.throws(() => store.book(bob, { ...input, startsAt: '2026-10-10T09:30:00+04:00', endsAt: '2026-10-10T10:30:00+04:00' }, 'overlapping-key'), code('SLOT_TAKEN'));
    assert.throws(() => store.book(bob, { ...input, startsAt: '2026-10-10T08:30:00+04:00', endsAt: '2026-10-10T10:30:00+04:00' }, 'containing-key'), code('SLOT_TAKEN'));
    assert.equal(store.book(bob, { ...input, startsAt: input.endsAt, endsAt: '2026-10-10T11:00:00+04:00' }, 'adjacent-key').booking.status, 'confirmed');
    store.cancel(alice, first.id);
    store.cancel(alice, first.id);
    assert.equal(store.activity(alice).length, 2);
    assert.equal(store.book(bob, input, 'after-cancel').booking.status, 'confirmed');
  } finally { store.close(); }
});

test('retry keys are scoped to an actor and reject a changed request', () => {
  let current = now;
  const store = new Store(':memory:', () => current);
  try {
    const result = store.book(alice, input, 'stable-retry-key');
    current += 10 * 86400000;
    assert.equal(store.book(alice, input, 'stable-retry-key').booking.id, result.booking.id);
    assert.equal(store.book(alice, input, 'stable-retry-key').replayed, true);
    assert.equal(store.activity(alice).length, 1);
    current = now;
    assert.throws(() => store.book(alice, { ...input, resourceId: 'boardroom' }, 'stable-retry-key'), code('KEY_REUSED'));
    assert.equal(store.book(bob, { ...input, resourceId: 'boardroom' }, 'stable-retry-key').replayed, false);
  } finally { store.close(); }
});

test('workspace and ownership checks block cross-account reads and cancellations', () => {
  const store = new Store(':memory:', () => now);
  try {
    const booking = store.book(alice, input, 'alice-request').booking;
    assert.equal(store.resources(carol).length, 1);
    assert.equal(store.bookings(bob).length, 0);
    assert.equal(store.bookings(carol).length, 0);
    assert.equal(store.activity(bob).length, 0);
    assert.throws(() => store.availability(carol, 'focus-room'), code('NOT_FOUND'));
    assert.throws(() => store.book(carol, input, 'carol-request'), code('NOT_FOUND'));
    assert.throws(() => store.cancel(bob, booking.id), code('NOT_FOUND'));
    assert.throws(() => store.cancel(carol, booking.id), code('NOT_FOUND'));
    assert.deepEqual(Object.keys(store.availability(bob, 'focus-room')[0]).sort(), ['ends_at', 'starts_at']);
  } finally { store.close(); }
});

test('invalid dates, ambiguous timestamps, past requests and injected fields fail', () => {
  const store = new Store(':memory:', () => now);
  try {
    const invalids = [null, [], { ...input, organizationId: 'south' }, { ...input, startsAt: '2026-02-30T09:00:00Z' },
      { ...input, startsAt: '2026-10-10T09:00:00' }, { ...input, endsAt: input.startsAt },
      { ...input, startsAt: '2026-10-08T09:00:00Z', endsAt: '2026-10-08T10:00:00Z' },
      { ...input, startsAt: '2026-12-01T09:00:00Z', endsAt: '2026-12-01T10:00:00Z' }];
    for (const invalid of invalids) assert.throws(() => store.book(alice, invalid, 'invalid-request'), error => error instanceof AppError && error.status === 400);
    assert.throws(() => store.book(alice, input, 'short'), code('INVALID_IDEMPOTENCY_KEY'));
    assert.equal(store.bookings(alice).length, 0);
  } finally { store.close(); }
});

test('reservations survive closing and reopening the database', () => {
  const dir = mkdtempSync(join(tmpdir(), 'slotwise-persistence-'));
  try {
    const path = join(dir, 'test.sqlite');
    const first = new Store(path, () => now);
    const id = first.book(alice, input, 'persist-request').booking.id;
    first.close();
    const second = new Store(path, () => now);
    assert.equal(second.bookings(alice)[0].id, id);
    second.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('two independent workers racing for one slot produce one winner', { timeout: 15000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'slotwise-race-'));
  const path = join(dir, 'race.sqlite');
  const initial = new Store(path, () => now); initial.close();
  const gate = new SharedArrayBuffer(4);
  const workers: Worker[] = [];
  try {
    const results = ['demo-alice', 'demo-bob'].map(token => new Promise<{ status: string; code?: string }>((resolve, reject) => {
      const worker = new Worker(new URL('./race-worker.ts', import.meta.url), { workerData: { path, now, input, token, gate } });
      workers.push(worker);
      worker.on('message', message => resolve(message)); worker.on('error', reject);
      worker.on('exit', exitCode => { if (exitCode !== 0) reject(new Error(`Worker exited: ${exitCode}`)); });
    }));
    const result = await Promise.all(results);
    assert.equal(result.filter(row => row.status === 'created').length, 1);
    assert.equal(result.filter(row => row.code === 'SLOT_TAKEN').length, 1);
    const verify = new Store(path, () => now);
    assert.equal(verify.db.prepare("SELECT COUNT(*) AS count FROM bookings WHERE status = 'confirmed'").get()?.count, 1);
    verify.close();
  } finally { await Promise.all(workers.map(worker => worker.terminate())); rmSync(dir, { recursive: true, force: true }); }
});
