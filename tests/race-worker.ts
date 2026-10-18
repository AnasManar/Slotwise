import { workerData, parentPort } from 'node:worker_threads';
import { Store, DEMO_ACTORS } from '../src/store.ts';
import { AppError } from '../src/domain.ts';

const store = new Store(workerData.path, () => workerData.now);
const gate = new Int32Array(workerData.gate);
const ready = Atomics.add(gate, 0, 1) + 1;
if (ready === 2) Atomics.notify(gate, 0);
else while (Atomics.load(gate, 0) < 2) Atomics.wait(gate, 0, 1, 1000);
try {
  store.book(DEMO_ACTORS[workerData.token], workerData.input, `race-${workerData.token}`);
  parentPort?.postMessage({ status: 'created' });
} catch (error) {
  if (error instanceof AppError) parentPort?.postMessage({ status: 'rejected', code: error.code });
  else throw error;
} finally { store.close(); }
