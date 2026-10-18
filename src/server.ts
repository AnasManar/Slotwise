import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Store } from './store.ts';
import { createApp } from './app.ts';

const dbPath = resolve(process.env.SLOTWISE_DB || 'data/slotwise.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
const store = new Store(dbPath);
const server = createApp(store);
const port = Number(process.env.PORT || 3000);
server.listen(port, '127.0.0.1', () => console.log(`Slotwise local demo: http://localhost:${port}`));
function shutdown() {
  server.close(() => { store.close(); process.exit(0); });
  server.closeIdleConnections();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
