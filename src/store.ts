import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import { AppError, parseBooking, type Actor, type Booking } from './domain.ts';

export const DEMO_ACTORS: Record<string, Actor> = {
  'demo-alice': { id: 'alice', organizationId: 'north', name: 'Alice' },
  'demo-bob': { id: 'bob', organizationId: 'north', name: 'Bob' },
  'demo-carol': { id: 'carol', organizationId: 'south', name: 'Carol' }
};

export class Store {
  db: DatabaseSync;
  clock: () => number;
  constructor(path = ':memory:', clock = Date.now) {
    this.clock = clock;
    this.db = new DatabaseSync(path, { timeout: 5000 });
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS organizations (id TEXT PRIMARY KEY, name TEXT NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id), name TEXT NOT NULL,
        UNIQUE(id, organization_id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS resources (
        id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id),
        name TEXT NOT NULL, capacity INTEGER NOT NULL CHECK(capacity > 0), description TEXT NOT NULL,
        UNIQUE(id, organization_id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS bookings (
        id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id),
        user_id TEXT NOT NULL, resource_id TEXT NOT NULL,
        starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL CHECK(ends_at > starts_at),
        status TEXT NOT NULL CHECK(status IN ('confirmed', 'cancelled')), created_at INTEGER NOT NULL,
        FOREIGN KEY(user_id, organization_id) REFERENCES users(id, organization_id),
        FOREIGN KEY(resource_id, organization_id) REFERENCES resources(id, organization_id)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS bookings_overlap ON bookings(organization_id, resource_id, starts_at, ends_at)
        WHERE status = 'confirmed';
      CREATE TABLE IF NOT EXISTS idempotency (
        organization_id TEXT NOT NULL, user_id TEXT NOT NULL, key TEXT NOT NULL,
        fingerprint TEXT NOT NULL, booking_id TEXT NOT NULL REFERENCES bookings(id),
        PRIMARY KEY(organization_id, user_id, key)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS audit_events (
        id INTEGER PRIMARY KEY, organization_id TEXT NOT NULL, user_id TEXT NOT NULL,
        booking_id TEXT NOT NULL REFERENCES bookings(id), action TEXT NOT NULL, created_at INTEGER NOT NULL
      ) STRICT;
    `);
    this.seed();
  }

  seed() {
    this.db.prepare('INSERT OR IGNORE INTO organizations VALUES (?, ?)').run('north', 'North Studio');
    this.db.prepare('INSERT OR IGNORE INTO organizations VALUES (?, ?)').run('south', 'South Studio');
    for (const actor of Object.values(DEMO_ACTORS)) {
      this.db.prepare('INSERT OR IGNORE INTO users VALUES (?, ?, ?)').run(actor.id, actor.organizationId, actor.name);
    }
    const insert = this.db.prepare('INSERT OR IGNORE INTO resources VALUES (?, ?, ?, ?, ?)');
    insert.run('focus-room', 'north', 'Focus room', 4, 'A quiet space for small teams.');
    insert.run('boardroom', 'north', 'Boardroom', 10, 'Space for workshops and planning.');
    insert.run('podcast-studio', 'north', 'Podcast studio', 2, 'A recording space for your next idea.');
    insert.run('south-room', 'south', 'South meeting room', 6, 'A separate workspace, with its own reservations.');
  }

  private transaction<T>(work: () => T): T {
    // Acquire the writer lock BEFORE checking for overlaps, including across processes.
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  resources(actor: Actor) {
    return this.db.prepare('SELECT id, name, capacity, description FROM resources WHERE organization_id = ? ORDER BY name').all(actor.organizationId);
  }

  availability(actor: Actor, resourceId: string) {
    if (!this.db.prepare('SELECT id FROM resources WHERE id = ? AND organization_id = ?').get(resourceId, actor.organizationId)) {
      throw new AppError(404, 'NOT_FOUND', 'Resource not found.');
    }
    // Expose occupied times, never the other user's identity or booking ID.
    return this.db.prepare(`SELECT starts_at, ends_at FROM bookings WHERE organization_id = ?
      AND resource_id = ? AND status = 'confirmed' AND ends_at > ? ORDER BY starts_at`).all(actor.organizationId, resourceId, this.clock());
  }

  bookings(actor: Actor) {
    return this.db.prepare(`SELECT b.*, r.name AS resource_name FROM bookings b JOIN resources r ON r.id = b.resource_id
      WHERE b.organization_id = ? AND b.user_id = ? ORDER BY b.starts_at`).all(actor.organizationId, actor.id);
  }

  book(actor: Actor, body: unknown, key: unknown): { booking: Booking; replayed: boolean } {
    if (typeof key !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(key)) {
      throw new AppError(400, 'INVALID_IDEMPOTENCY_KEY', 'Send an Idempotency-Key of 8–100 letters, digits, underscores or hyphens.');
    }
    // Parse shape and duration independently of the current time to permit old request replays.
    const input = parseBooking(body);
    const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    return this.transaction(() => {
      const previous = this.db.prepare(`SELECT fingerprint, booking_id FROM idempotency
        WHERE organization_id = ? AND user_id = ? AND key = ?`).get(actor.organizationId, actor.id, key);
      if (previous) {
        if (previous.fingerprint !== fingerprint) throw new AppError(409, 'KEY_REUSED', 'This key was used with a different booking request.');
        return { booking: this.db.prepare('SELECT * FROM bookings WHERE id = ?').get(previous.booking_id) as Booking, replayed: true };
      }
      parseBooking(body, this.clock());
      if (!this.db.prepare('SELECT id FROM resources WHERE id = ? AND organization_id = ?').get(input.resourceId, actor.organizationId)) {
        throw new AppError(404, 'NOT_FOUND', 'Resource not found.');
      }
      const overlap = this.db.prepare(`SELECT id FROM bookings WHERE organization_id = ? AND resource_id = ?
        AND status = 'confirmed' AND starts_at < ? AND ends_at > ? LIMIT 1`).get(actor.organizationId, input.resourceId, input.end, input.start);
      if (overlap) throw new AppError(409, 'SLOT_TAKEN', 'Someone already reserved this time. Choose another slot.');
      const id = randomUUID();
      const now = this.clock();
      this.db.prepare(`INSERT INTO bookings VALUES (?, ?, ?, ?, ?, ?, 'confirmed', ?)`).run(id, actor.organizationId, actor.id, input.resourceId, input.start, input.end, now);
      this.db.prepare('INSERT INTO idempotency VALUES (?, ?, ?, ?, ?)').run(actor.organizationId, actor.id, key, fingerprint, id);
      this.db.prepare(`INSERT INTO audit_events(organization_id, user_id, booking_id, action, created_at) VALUES (?, ?, ?, 'created', ?)`).run(actor.organizationId, actor.id, id, now);
      return { booking: this.db.prepare('SELECT * FROM bookings WHERE id = ?').get(id) as Booking, replayed: false };
    });
  }

  cancel(actor: Actor, id: string) {
    return this.transaction(() => {
      const booking = this.db.prepare('SELECT * FROM bookings WHERE id = ? AND organization_id = ? AND user_id = ?').get(id, actor.organizationId, actor.id) as Booking | undefined;
      if (!booking) throw new AppError(404, 'NOT_FOUND', 'Booking not found.');
      if (booking.status === 'confirmed') {
        this.db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").run(id);
        this.db.prepare(`INSERT INTO audit_events(organization_id, user_id, booking_id, action, created_at) VALUES (?, ?, ?, 'cancelled', ?)`).run(actor.organizationId, actor.id, id, this.clock());
      }
      return this.db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
    });
  }

  activity(actor: Actor) {
    return this.db.prepare(`SELECT id, booking_id, action, created_at FROM audit_events WHERE organization_id = ? AND user_id = ? ORDER BY id DESC LIMIT 20`).all(actor.organizationId, actor.id);
  }

  close() { this.db.close(); }
}
