import type { HotPayload } from 'vite';

export type NgDocSsrJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly NgDocSsrJsonValue[]
  | { readonly [key: string]: NgDocSsrJsonValue };

export interface NgDocSsrRequest {
  readonly document: string;
  readonly url: string;
  readonly data?: NgDocSsrJsonValue;
}

export const SSR_RENDER_PROTOCOL_VERSION = 1;
export const SSR_RENDER_MAX_ACTIVE = 8;
export const SSR_RENDER_MAX_QUEUED = 32;
export const SSR_RENDER_MAX_JSON_DEPTH = 64;
export const SSR_RENDER_MAX_MESSAGE_BYTES = 16 * 1024 * 1024;
export const SSR_RENDER_DEADLINE_MS = 120_000;
export const SSR_RENDER_CLOSE_DEADLINE_MS = 5_000;
export const SSR_RENDER_CONTROL_ID = '/@ng-doc/ssr-render-control';
export const SSR_RENDER_CONTROL_EVENT = 'ngdoc:ssr-render-fence';

export interface SsrRenderLimits {
  readonly maxActive: number;
  readonly maxQueued: number;
  readonly maxDepth: number;
  readonly maxMessageBytes: number;
  readonly requestDeadlineMs: number;
  readonly startupDeadlineMs: number;
  readonly fenceDeadlineMs: number;
  readonly closeDeadlineMs: number;
}

export const DEFAULT_SSR_RENDER_LIMITS: SsrRenderLimits = Object.freeze({
  maxActive: SSR_RENDER_MAX_ACTIVE,
  maxQueued: SSR_RENDER_MAX_QUEUED,
  maxDepth: SSR_RENDER_MAX_JSON_DEPTH,
  maxMessageBytes: SSR_RENDER_MAX_MESSAGE_BYTES,
  requestDeadlineMs: SSR_RENDER_DEADLINE_MS,
  startupDeadlineMs: SSR_RENDER_DEADLINE_MS,
  fenceDeadlineMs: SSR_RENDER_DEADLINE_MS,
  closeDeadlineMs: SSR_RENDER_CLOSE_DEADLINE_MS,
});

export interface SerializedSsrError {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
  readonly code?: string;
}

interface Tagged {
  readonly version: typeof SSR_RENDER_PROTOCOL_VERSION;
  readonly epoch: string;
}

export type ParentToRendererMessage =
  | (Tagged & {
      readonly type: 'start';
      readonly entry: string;
      readonly controlId: string;
      readonly limits: SsrRenderLimits;
    })
  | (Tagged & { readonly type: 'hot'; readonly payload: HotPayload })
  | (Tagged & {
      readonly type: 'render';
      readonly id: number;
      readonly request: NgDocSsrRequest;
    })
  | (Tagged & { readonly type: 'cancel'; readonly id: number })
  | (Tagged & { readonly type: 'fence'; readonly id: number; readonly sequence: number })
  | (Tagged & { readonly type: 'close' });

export type RendererToParentMessage =
  | (Tagged & { readonly type: 'ready' })
  | (Tagged & { readonly type: 'transport'; readonly payload: HotPayload })
  | (Tagged & { readonly type: 'rendered'; readonly id: number; readonly html: string })
  | (Tagged & {
      readonly type: 'render-error';
      readonly id: number;
      readonly error: SerializedSsrError;
    })
  | (Tagged & { readonly type: 'fence-ready'; readonly id: number; readonly sequence: number })
  | (Tagged & { readonly type: 'fenced'; readonly id: number; readonly sequence: number })
  | (Tagged & {
      readonly type: 'fence-error';
      readonly id: number;
      readonly error: SerializedSsrError;
    })
  | (Tagged & { readonly type: 'closed' })
  | (Tagged & { readonly type: 'fatal'; readonly error: SerializedSsrError });

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function tagged(value: unknown): value is Record<string, unknown> & Tagged {
  return (
    record(value) &&
    value.version === SSR_RENDER_PROTOCOL_VERSION &&
    typeof value.epoch === 'string' &&
    value.epoch.length > 0
  );
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function serializedError(value: unknown): value is SerializedSsrError {
  return (
    record(value) &&
    typeof value.name === 'string' &&
    typeof value.message === 'string' &&
    (value.stack === undefined || typeof value.stack === 'string') &&
    (value.code === undefined || typeof value.code === 'string')
  );
}

function hotPayload(value: unknown, childToServer: boolean = false): value is HotPayload {
  if (!record(value) || typeof value.type !== 'string') return false;
  if (childToServer) {
    return value.type === 'custom' && typeof value.event === 'string';
  }
  switch (value.type) {
    case 'connected':
    case 'ping':
      return true;
    case 'custom':
      return typeof value.event === 'string';
    case 'full-reload':
      return (
        (value.path === undefined || typeof value.path === 'string') &&
        (value.triggeredBy === undefined || typeof value.triggeredBy === 'string')
      );
    case 'prune':
      return Array.isArray(value.paths) && value.paths.every((path) => typeof path === 'string');
    case 'update':
      return (
        Array.isArray(value.updates) &&
        value.updates.every(
          (update) =>
            record(update) &&
            (update.type === 'js-update' || update.type === 'css-update') &&
            typeof update.path === 'string' &&
            typeof update.acceptedPath === 'string' &&
            Number.isFinite(update.timestamp),
        )
      );
    case 'error':
      return record(value.err) && typeof value.err.message === 'string';
    default:
      return false;
  }
}

function limits(value: unknown): value is SsrRenderLimits {
  return (
    record(value) &&
    [
      'maxActive',
      'maxQueued',
      'maxDepth',
      'maxMessageBytes',
      'requestDeadlineMs',
      'startupDeadlineMs',
      'fenceDeadlineMs',
      'closeDeadlineMs',
    ].every((key) => Number.isSafeInteger(value[key]) && (value[key] as number) > 0)
  );
}

export function isParentToRendererMessage(value: unknown): value is ParentToRendererMessage {
  if (!tagged(value) || typeof value.type !== 'string') return false;
  switch (value.type) {
    case 'start':
      return (
        typeof value.entry === 'string' &&
        typeof value.controlId === 'string' &&
        limits(value.limits)
      );
    case 'hot':
      return hotPayload(value.payload);
    case 'render':
      if (!positiveInteger(value.id)) return false;
      try {
        validateRequest(value.request);
        return true;
      } catch {
        return false;
      }
    case 'cancel':
      return positiveInteger(value.id);
    case 'fence':
      return positiveInteger(value.id) && positiveInteger(value.sequence);
    case 'close':
      return true;
    default:
      return false;
  }
}

export function isRendererToParentMessage(value: unknown): value is RendererToParentMessage {
  if (!tagged(value) || typeof value.type !== 'string') return false;
  switch (value.type) {
    case 'ready':
    case 'closed':
      return true;
    case 'transport':
      return hotPayload(value.payload, true);
    case 'rendered':
      return positiveInteger(value.id) && typeof value.html === 'string';
    case 'render-error':
    case 'fence-error':
      return positiveInteger(value.id) && serializedError(value.error);
    case 'fenced':
    case 'fence-ready':
      return positiveInteger(value.id) && positiveInteger(value.sequence);
    case 'fatal':
      return serializedError(value.error);
    default:
      return false;
  }
}

export function messageBytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value));
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export function validateEntry(entry: unknown): asserts entry is string {
  if (typeof entry !== 'string' || !entry || entry.includes('\0')) {
    throw new TypeError(
      '[NGDOC_SSR_RENDER_ENTRY] entry must be a non-empty module ID without NUL.',
    );
  }
}

export function validateRequest(
  value: unknown,
  maxDepth: number = SSR_RENDER_MAX_JSON_DEPTH,
): asserts value is NgDocSsrRequest {
  if (
    !record(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  ) {
    throw new TypeError(
      '[NGDOC_SSR_RENDER_REQUEST] document and absolute HTTP(S) url are required.',
    );
  }
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== 'string' || !['document', 'url', 'data'].includes(key))) {
    throw new TypeError('[NGDOC_SSR_RENDER_REQUEST] request contains unsupported properties.');
  }
  for (const key of ['document', 'url', ...(keys.includes('data') ? ['data'] : [])]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
      throw new TypeError('[NGDOC_SSR_RENDER_REQUEST] request properties must be enumerable data.');
    }
  }
  if (typeof value.document !== 'string' || typeof value.url !== 'string') {
    throw new TypeError(
      '[NGDOC_SSR_RENDER_REQUEST] document and absolute HTTP(S) url are required.',
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(value.url);
  } catch {
    throw new TypeError('[NGDOC_SSR_RENDER_REQUEST] url must be absolute HTTP(S).');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new TypeError('[NGDOC_SSR_RENDER_REQUEST] url must be absolute HTTP(S).');
  }
  if (value.data !== undefined) validateJson(value.data, maxDepth);
}

export function validateJson(value: unknown, maxDepth: number = SSR_RENDER_MAX_JSON_DEPTH): void {
  const ancestors = new Set<object>();
  const visit = (item: unknown, depth: number): void => {
    if (depth > maxDepth)
      throw new TypeError('[NGDOC_SSR_RENDER_JSON] maximum JSON depth exceeded.');
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
    if (typeof item === 'number') {
      if (!Number.isFinite(item))
        throw new TypeError('[NGDOC_SSR_RENDER_JSON] numbers must be finite.');
      return;
    }
    if (typeof item !== 'object') {
      throw new TypeError('[NGDOC_SSR_RENDER_JSON] data contains a non-JSON value.');
    }
    if (ancestors.has(item)) throw new TypeError('[NGDOC_SSR_RENDER_JSON] data contains a cycle.');
    const prototype = Object.getPrototypeOf(item);
    if (
      (Array.isArray(item) && prototype !== Array.prototype) ||
      (!Array.isArray(item) && prototype !== Object.prototype && prototype !== null)
    ) {
      throw new TypeError('[NGDOC_SSR_RENDER_JSON] data contains an unsupported object prototype.');
    }
    ancestors.add(item);
    const keys = Reflect.ownKeys(item);
    for (const key of keys) {
      if (typeof key !== 'string') {
        throw new TypeError('[NGDOC_SSR_RENDER_JSON] symbol keys are unsupported.');
      }
      if (Array.isArray(item) && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
        throw new TypeError(
          '[NGDOC_SSR_RENDER_JSON] accessors and non-enumerable properties are unsupported.',
        );
      }
      if (Array.isArray(item)) {
        if (!/^(?:0|[1-9]\d*)$/.test(key) || Number(key) >= item.length) {
          throw new TypeError('[NGDOC_SSR_RENDER_JSON] named array properties are unsupported.');
        }
      }
      visit(descriptor.value, depth + 1);
    }
    if (Array.isArray(item) && keys.length !== item.length + 1) {
      throw new TypeError('[NGDOC_SSR_RENDER_JSON] sparse arrays are unsupported.');
    }
    ancestors.delete(item);
  };
  visit(value, 0);
}

export function serializeError(error: unknown): SerializedSsrError {
  const source = error instanceof Error ? error : new Error(String(error));
  const code = 'code' in source && typeof source.code === 'string' ? source.code : undefined;
  return {
    name: source.name.slice(0, 256),
    message: source.message.slice(0, 64 * 1024),
    ...(source.stack ? { stack: source.stack.slice(0, 256 * 1024) } : {}),
    ...(code ? { code } : {}),
  };
}

export function reviveError(error: SerializedSsrError, prefix: string = 'NGDOC_SSR_RENDER'): Error {
  const revived = new Error(`[${prefix}] ${error.message}`);
  revived.name = error.name;
  if (error.stack)
    revived.stack = `${revived.name}: ${revived.message}\nCaused by child:\n${error.stack}`;
  if (error.code) Object.assign(revived, { code: error.code });
  return revived;
}
