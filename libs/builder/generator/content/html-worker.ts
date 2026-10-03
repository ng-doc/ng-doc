import { parentPort } from 'node:worker_threads';

import { serveHtmlThread } from './html-pipeline';

/**
 * A render thread of the compiler runtime (`./html-pool`): it serves the HTML pipeline on its
 * parent port and imports nothing else (`source-boundaries`).
 */
if (parentPort) serveHtmlThread(parentPort);
