import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { Store } from '../src/store.ts';
import { createApp } from '../src/app.ts';

test('HTTP API exercises auth, validation, retries, conflicts, isolation and cancellation', async () => {
  const now = Date.parse('2026-10-09T08:00:00Z');
  const store = new Store(':memory:', () => now);
  const app = createApp(store, false);
  await new Promise<void>(resolve => app.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
  const headers = { Authorization: 'Bearer demo-alice', 'Content-Type': 'application/json', 'Idempotency-Key': 'http-request-key' };
  const body = JSON.stringify({ resourceId: 'focus-room', startsAt: '2026-10-10T09:00:00+04:00', endsAt: '2026-10-10T10:00:00+04:00' });
  try {
    const health = await fetch(`${base}/health`); assert.equal(health.status, 200);
    const page = await fetch(base); assert.equal(page.status, 200); assert.match(await page.text(), /The booking <em>desk/);
    assert.equal((await fetch(`${base}/api/bookings`)).status, 401);
    assert.equal((await fetch(`${base}/api/me`, { headers: { Authorization: 'Bearer toString' } })).status, 401);
    const bad = await fetch(`${base}/api/bookings`, { method: 'POST', headers, body: '{' });
    assert.equal(bad.status, 400); assert.ok((await bad.json()).error.requestId);
    assert.equal((await fetch(`${base}/api/bookings`, { method: 'POST', headers: { ...headers, 'Content-Type': 'text/plain' }, body })).status, 415);
    assert.equal((await fetch(`${base}/api/bookings`, { method: 'POST', headers, body: JSON.stringify({ text: 'a'.repeat(18000) }) })).status, 413);
    const created = await fetch(`${base}/api/bookings`, { method: 'POST', headers, body }); assert.equal(created.status, 201);
    const id = (await created.json()).booking.id;
    const replay = await fetch(`${base}/api/bookings`, { method: 'POST', headers, body }); assert.equal(replay.status, 200); assert.equal((await replay.json()).replayed, true);
    assert.equal((await fetch(`${base}/api/bookings`, { method: 'POST', headers: { ...headers, Authorization: 'Bearer demo-bob' }, body })).status, 409);
    assert.deepEqual(await (await fetch(`${base}/api/bookings`, { headers: { Authorization: 'Bearer demo-carol' } })).json(), []);
    assert.equal((await fetch(`${base}/api/bookings/${id}/cancel`, { method: 'POST', headers: { Authorization: 'Bearer demo-bob' } })).status, 404);
    assert.equal((await fetch(`${base}/api/bookings/${id}/cancel`, { method: 'POST', headers })).status, 200);
    assert.equal((await fetch(`${base}/api/bookings`, { method: 'POST', headers: { ...headers, Authorization: 'Bearer demo-bob' }, body })).status, 201);
    assert.equal((await fetch(`${base}/api/resources/south-room/availability`, { headers })).status, 404);
    assert.equal((await fetch(`${base}/missing`)).status, 404);
  } finally {
    await new Promise<void>((resolve, reject) => { app.close(error => error ? reject(error) : resolve()); app.closeIdleConnections(); });
    store.close();
  }
});
