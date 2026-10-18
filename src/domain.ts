export type Actor = { id: string; organizationId: string; name: string };
export type BookingInput = { resourceId: string; startsAt: string; endsAt: string };
export type Booking = {
  id: string; organization_id: string; user_id: string; resource_id: string;
  starts_at: number; ends_at: number; status: 'confirmed' | 'cancelled'; created_at: number;
};

export class AppError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function timestamp(value: unknown): number {
  if (typeof value !== 'string') throw new AppError(400, 'INVALID_TIME', 'Use an ISO timestamp with a timezone.');
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!parts) throw new AppError(400, 'INVALID_TIME', 'Use an ISO timestamp with a timezone.');
  const [year, month, day, hour, minute, second] = parts.slice(1).map(Number);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  const result = Date.parse(value);
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 ||
      calendar.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59 || !Number.isFinite(result)) {
    throw new AppError(400, 'INVALID_TIME', 'The date or time is invalid.');
  }
  return result;
}

export function parseBooking(value: unknown, now?: number): { resourceId: string; start: number; end: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppError(400, 'INVALID_BODY', 'Send a JSON object.');
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(key => !['resourceId', 'startsAt', 'endsAt'].includes(key))) {
    throw new AppError(400, 'UNKNOWN_FIELD', 'Only resourceId, startsAt and endsAt are accepted.');
  }
  if (typeof body.resourceId !== 'string' || !/^[a-z0-9-]{1,80}$/.test(body.resourceId)) {
    throw new AppError(400, 'INVALID_RESOURCE', 'Choose a valid resource.');
  }
  const start = timestamp(body.startsAt);
  const end = timestamp(body.endsAt);
  if (now !== undefined && (start <= now || end > now + 30 * 86400000)) throw new AppError(400, 'INVALID_WINDOW', 'Bookings must be in the future and within 30 days.');
  if (end - start < 15 * 60000 || end - start > 4 * 3600000) {
    throw new AppError(400, 'INVALID_DURATION', 'Book between 15 minutes and four hours.');
  }
  return { resourceId: body.resourceId, start, end };
}
