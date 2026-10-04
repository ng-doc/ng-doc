import { SSR_RENDER_CONTROL_EVENT, SSR_RENDER_PROTOCOL_VERSION } from './ssr-renderer-protocol';

export function renderSsrControlModule(epoch: string): string {
  return `
const protocolVersion = ${SSR_RENDER_PROTOCOL_VERSION};
const runtimeEpoch = ${JSON.stringify(epoch)};
const stateKey = Symbol.for('@ng-doc/vite:ssr-render-control');
const root = globalThis;
const previous = root[stateKey];
const state = previous?.version === protocolVersion && previous.epoch === runtimeEpoch
  ? previous
  : { version: protocolVersion, epoch: runtimeEpoch, sequence: 0, waiters: [] };
root[stateKey] = state;

function acceptFence(data) {
  if (!data || data.version !== protocolVersion || data.epoch !== runtimeEpoch ||
      !Number.isSafeInteger(data.sequence) || data.sequence < 0) return;
  state.sequence = Math.max(state.sequence, data.sequence);
  for (const waiter of state.waiters.splice(0)) {
    if (waiter.sequence <= state.sequence) waiter.resolve(state.sequence);
    else state.waiters.push(waiter);
  }
}

if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.on(${JSON.stringify(SSR_RENDER_CONTROL_EVENT)}, acceptFence);
}

export function waitForNgDocSsrFence(sequence, signal) {
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    return Promise.reject(new TypeError('Invalid NgDoc SSR fence sequence.'));
  }
  if (signal?.aborted) return Promise.reject(signal.reason);
  if (state.sequence >= sequence) return Promise.resolve(state.sequence);
  return new Promise((resolve, reject) => {
    const waiter = {
      sequence,
      resolve(value) {
        signal?.removeEventListener('abort', abort);
        resolve(value);
      },
      reject(error) {
        signal?.removeEventListener('abort', abort);
        reject(error);
      },
    };
    const abort = () => {
      const index = state.waiters.indexOf(waiter);
      if (index >= 0) state.waiters.splice(index, 1);
      waiter.reject(signal.reason);
    };
    signal?.addEventListener('abort', abort, { once: true });
    state.waiters.push(waiter);
  });
}
`;
}
