import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { AppError } from './domain.ts';
import { Store, DEMO_ACTORS } from './store.ts';

const assets = new Map([
  ['/', { content: readFileSync(new URL('../public/index.html', import.meta.url)), mime: 'text/html; charset=utf-8' }],
  ['/app.js', { content: readFileSync(new URL('../public/app.js', import.meta.url)), mime: 'text/javascript; charset=utf-8' }],
  ['/style.css', { content: readFileSync(new URL('../public/style.css', import.meta.url)), mime: 'text/css; charset=utf-8' }]
]);

async function readJson(req: IncomingMessage): Promise<unknown> {
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new AppError(415, 'JSON_REQUIRED', 'Send Content-Type: application/json.');
  }
  const text = await new Promise<string>((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => { size += chunk.length; if (size <= 16384) chunks.push(chunk); });
    req.on('end', () => {
      if (size > 16384) reject(new AppError(413, 'BODY_TOO_LARGE', 'Request body exceeds 16 KiB.'));
      else resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
  try { return JSON.parse(text); }
  catch { throw new AppError(400, 'INVALID_JSON', 'Request body contains invalid JSON.'); }
}

function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

export function createApp(store: Store, log = true) {
  const server = createServer(async (req, res) => {
    const requestId = randomUUID();
    const started = performance.now();
    res.setHeader('X-Request-Id', requestId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    if (log) res.on('finish', () => console.log(JSON.stringify({ requestId, method: req.method, status: res.statusCode, durationMs: Math.round(performance.now() - started) })));
    try {
      const path = new URL(req.url || '/', 'http://localhost').pathname;
      const method = req.method;
      if (method === 'GET' && path === '/health') return json(res, 200, { status: 'ok', mode: 'local-demo' });
      const asset = assets.get(path);
      if (method === 'GET' && asset) {
        res.writeHead(200, { 'Content-Type': asset.mime, 'Cache-Control': 'no-cache' });
        return res.end(asset.content);
      }
      if (!path.startsWith('/api/')) throw new AppError(404, 'NOT_FOUND', 'Route not found.');
      const authorization = req.headers.authorization || '';
      const actor = DEMO_ACTORS[authorization.startsWith('Bearer ') ? authorization.slice(7) : ''];
      if (!actor || !Object.hasOwn(DEMO_ACTORS, authorization.slice(7))) throw new AppError(401, 'UNAUTHORIZED', 'Choose a demo account or send its Bearer token.');
      if (method === 'GET' && path === '/api/me') return json(res, 200, { ...actor, demo: true });
      if (method === 'GET' && path === '/api/resources') return json(res, 200, store.resources(actor));
      const availability = /^\/api\/resources\/([a-z0-9-]+)\/availability$/.exec(path);
      if (method === 'GET' && availability) return json(res, 200, store.availability(actor, availability[1]));
      if (method === 'GET' && path === '/api/bookings') return json(res, 200, store.bookings(actor));
      if (method === 'GET' && path === '/api/activity') return json(res, 200, store.activity(actor));
      if (method === 'POST' && path === '/api/bookings') {
        const result = store.book(actor, await readJson(req), req.headers['idempotency-key']);
        return json(res, result.replayed ? 200 : 201, result);
      }
      const cancel = /^\/api\/bookings\/([a-z0-9-]+)\/cancel$/.exec(path);
      if (method === 'POST' && cancel) return json(res, 200, store.cancel(actor, cancel[1]));
      throw new AppError(404, 'NOT_FOUND', 'Route not found.');
    } catch (error) {
      if (error instanceof AppError) return json(res, error.status, { error: { code: error.code, message: error.message, requestId } });
      if (log) console.error(JSON.stringify({ requestId, error: error instanceof Error ? error.message : 'Unknown error' }));
      json(res, 500, { error: { code: 'INTERNAL_ERROR', message: 'Unexpected error.', requestId } });
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  return server;
}
