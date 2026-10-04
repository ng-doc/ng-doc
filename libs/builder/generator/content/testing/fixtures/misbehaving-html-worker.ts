import { parentPort } from 'node:worker_threads';

import { serveHtmlThread } from '../../html-pipeline';

/**
 * A render thread entry for the pool's tests: `THREAD_MODE` (defined when it is bundled) says how
 * it behaves.
 * - `throw-on-load`: the module throws before it serves anything;
 * - `exit-mid-task`: the thread exits when it receives its first render or link job;
 * - `malformed:<n>`: every job gets the n-th kind of reply that is not a result;
 * - `failed`: every job replies that it failed;
 * - `stray`: every job gets a reply to another job;
 * - `wrong`: every job gets a well-formed result that is not the pipeline's;
 * - `delayed`: a correct thread whose replies take a random 0-20 ms, so that jobs complete in
 *   another order than they were sent;
 * - `hang`: jobs are never answered.
 */
declare const THREAD_MODE: string;

const port = parentPort!;
const send = (value: unknown) => port.postMessage(JSON.stringify(value));
const malformed: Array<(id: unknown) => unknown> = [
  (id) => ({ type: 'done', id, result: { documents: 'none' } }),
  // A document that failed before the last one.
  (id) => ({
    type: 'done',
    id,
    result: {
      documents: [
        { failed: 'process', message: 'x', mismatches: 0 },
        { html: '', anchors: [], usedKeywords: [], mismatches: 0 },
      ],
    },
  }),
  // A task that stopped early without a failure.
  (id) => ({ type: 'done', id, result: { documents: [] } }),
  // A render without the highlight report it was asked for, and a link without its keys.
  (id) => ({
    type: 'done',
    id,
    result: { documents: [{ html: '', anchors: [], usedKeywords: [], mismatches: 0 }], html: '' },
  }),
  (id) => ({ type: 'result', id }),
  () => 'not an object',
];

if (THREAD_MODE === 'throw-on-load') throw new Error('The thread cannot load');
if (THREAD_MODE === 'delayed')
  serveHtmlThread({
    on: (event, listener) => port.on(event, listener),
    postMessage: (value) => setTimeout(() => port.postMessage(value), Math.random() * 20),
  });
else
  port.on('message', (message) => {
    const { type, id } = JSON.parse(String(message)) as { type?: string; id?: unknown };
    if (type !== 'render' && type !== 'link') return;
    if (THREAD_MODE === 'exit-mid-task') process.exit(3);
    if (THREAD_MODE.startsWith('malformed:'))
      send(malformed[Number(THREAD_MODE.slice('malformed:'.length))]!(id));
    if (THREAD_MODE === 'failed') send({ type: 'failed', id, message: 'cannot run' });
    if (THREAD_MODE === 'stray') send({ type: 'done', id: 1_000_000, result: {} });
    if (THREAD_MODE === 'wrong')
      send({
        type: 'done',
        id,
        result:
          type === 'render'
            ? {
                documents: [{ html: '<p>wrong</p>', anchors: [], usedKeywords: [], mismatches: 0 }],
                highlight: [{ used: [], fresh: [], mismatched: [] }],
              }
            : { html: '<p>wrong</p>', searchRecords: [], consulted: [] },
      });
  });
