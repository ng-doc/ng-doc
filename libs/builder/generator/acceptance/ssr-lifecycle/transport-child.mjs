import assert from 'node:assert/strict';

import { ModuleRunner, createNodeImportMeta } from 'vite/module-runner';

let handlers;
const transport = {
  connect(next) {
    handlers = next;
  },
  disconnect() {
    handlers = undefined;
  },
  send(payload) {
    process.send?.({ kind: 'child-to-server', payload });
  },
};

const runner = new ModuleRunner({
  transport,
  hmr: true,
  createImportMeta: createNodeImportMeta,
  sourcemapInterceptor: 'node',
});

const errorRecord = (error) => ({
  name: error instanceof Error ? error.name : 'Error',
  message: error instanceof Error ? error.message : String(error),
  stack: error instanceof Error ? error.stack : undefined,
});

const waitForEpoch = (target) =>
  new Promise((resolve, reject) => {
    const state = globalThis.__ngDocSsrTransportProbe;
    assert.ok(state, 'SSR transport probe state is unavailable');
    if (state.epoch >= target) {
      resolve(state.epoch);
      return;
    }
    const timer = setTimeout(
      () =>
        reject(
          new Error(`Timed out waiting for child HMR epoch ${target}; current=${state.epoch}`),
        ),
      30_000,
    );
    state.waiters.push((epoch) => {
      clearTimeout(timer);
      resolve(epoch);
    });
  });

process.on('message', async (message) => {
  if (message?.kind === 'server-to-child') {
    handlers?.onMessage(message.payload);
    return;
  }
  if (message?.kind === 'server-disconnected') {
    handlers?.onDisconnection();
    return;
  }
  if (message?.kind !== 'command') return;
  try {
    let value;
    if (message.command === 'render') {
      const module = await runner.import(message.entry);
      value = await module.render(message.input);
    } else if (message.command === 'wait-epoch') {
      value = await waitForEpoch(message.target);
    } else if (message.command === 'close') {
      await runner.close();
      value = { closed: runner.isClosed() };
    } else {
      throw new Error(`Unknown child command: ${String(message.command)}`);
    }
    process.send?.({ kind: 'response', id: message.id, value });
    if (message.command === 'close') setImmediate(() => process.disconnect());
  } catch (error) {
    process.send?.({ kind: 'response', id: message.id, error: errorRecord(error) });
  }
});

process.send?.({ kind: 'ready' });
