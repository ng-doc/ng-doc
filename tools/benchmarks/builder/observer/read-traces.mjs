import { createReadStream } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';

/** A forced/partial worker trace is not a successful work-count cohort. */
export async function readObserverTraces(directory, { runId, expectedPids = [] }) {
  const files = (await readdir(directory)).filter((name) => name.endsWith('.jsonl')).sort();
  if (!files.length || !runId) throw new Error('Observer traces and run ID are required');
  const counts = Object.create(null);
  const pids = new Set();
  let physicalObservations = 0;
  for (const file of files) {
    const pending = new Map();
    let started = false;
    let ended = false;
    let calls = 0;
    let pid;
    const input = createReadStream(path.join(directory, file));
    const lines = createInterface({ input, crlfDelay: Infinity });
    try {
      for await (const line of lines) {
        const event = JSON.parse(line);
        if (event.schema !== 1 || event.run !== runId || !Number.isSafeInteger(event.pid) || ended)
          throw new Error(`Invalid observer envelope: ${file}`);
        pid ??= event.pid;
        if (pid !== event.pid) throw new Error(`Mixed observer process: ${file}`);
        if (!started) {
          if (event.event !== 'observer-start') throw new Error(`Missing observer start: ${file}`);
          started = true;
          continue;
        }
        if (event.event === 'observer-end') {
          if (event.failed || event.active !== 0 || pending.size || event.calls !== calls)
            throw new Error(`Incomplete/failed observer: ${file}`);
          ended = true;
        } else if (event.event === 'call') {
          if (event.id !== ++calls || typeof event.name !== 'string')
            throw new Error(`Invalid observer call: ${file}`);
          pending.set(event.id, event.name);
          const key = `${event.name}:call`;
          counts[key] = (counts[key] ?? 0) + 1;
        } else if (['return', 'throw', 'reject'].includes(event.event)) {
          if (pending.get(event.id) !== event.name)
            throw new Error(`Unpaired observer settlement: ${file}`);
          pending.delete(event.id);
          const key = `${event.name}:${event.event}${event.result?.status ? `:${event.result.status}` : ''}`;
          counts[key] = (counts[key] ?? 0) + 1;
        } else if (event.event === 'physical-observation') {
          if (
            !['content', 'existence', 'glob'].includes(event.kind) ||
            typeof event.identity !== 'string'
          )
            throw new Error(`Invalid physical observation: ${file}`);
          physicalObservations++;
        } else throw new Error(`Unknown observer event: ${file}`);
      }
    } finally {
      lines.close();
      input.destroy();
    }
    if (!ended) throw new Error(`Missing observer end: ${file}`);
    pids.add(pid);
  }
  for (const pid of expectedPids)
    if (!pids.has(pid)) throw new Error(`Missing expected observed process: ${pid}`);
  return { files, pids: [...pids].sort((a, b) => a - b), counts, physicalObservations };
}
