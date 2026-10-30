import { ɵNG_DOC_DEMO_MESSAGE_SOURCE } from './demo-message';
import { ɵdecodePlaygroundValue, ɵNgDocPlaygroundEncodedValue } from './playground-value';

/**
 * The values a documentation page sends to the frame of an isolated playground: the encoded
 * input values and the shown content slots. Each state has a higher `revision` than the one
 * before, so a frame drops a state that arrives after a newer one.
 * @internal
 */
export interface ɵNgDocPlaygroundStateMessage {
  readonly source: typeof ɵNG_DOC_DEMO_MESSAGE_SOURCE;
  readonly version: 1;
  readonly type: 'playground-state';
  readonly revision: number;
  /** The encoded value of each input, by property name. */
  readonly properties: Readonly<Record<string, ɵNgDocPlaygroundEncodedValue>>;
  /** Whether each content slot is shown, by slot name. */
  readonly content: Readonly<Record<string, boolean>>;
  /** Whether the frame creates the target again for this state. */
  readonly recreate: boolean;
}

/**
 * The message the frame of an isolated playground sends once its target exists: the target's
 * default input values, encoded, and the inputs whose default can't be encoded.
 * @internal
 */
export interface ɵNgDocPlaygroundReadyMessage {
  readonly source: typeof ɵNG_DOC_DEMO_MESSAGE_SOURCE;
  readonly version: 1;
  readonly type: 'playground-ready';
  readonly defaults: Readonly<Record<string, ɵNgDocPlaygroundEncodedValue>>;
  readonly uncloneable: readonly string[];
}

/**
 * The message the frame of an isolated playground sends once it has applied a state.
 * @internal
 */
export interface ɵNgDocPlaygroundAppliedMessage {
  readonly source: typeof ɵNG_DOC_DEMO_MESSAGE_SOURCE;
  readonly version: 1;
  readonly type: 'playground-applied';
  readonly revision: number;
}

/**
 * The message the frame of an isolated playground sends when its target throws while it is
 * created or while it takes a state.
 * @internal
 */
export interface ɵNgDocPlaygroundErrorMessage {
  readonly source: typeof ɵNG_DOC_DEMO_MESSAGE_SOURCE;
  readonly version: 1;
  readonly type: 'playground-error';
  readonly phase: 'create' | 'apply';
  readonly message: string;
}

/**
 * A message from the frame of an isolated playground to its documentation page.
 * @internal
 */
export type ɵNgDocPlaygroundFrameMessage =
  | ɵNgDocPlaygroundReadyMessage
  | ɵNgDocPlaygroundAppliedMessage
  | ɵNgDocPlaygroundErrorMessage;

type Fields = Record<string, unknown>;

function header(value: unknown, type: string): value is Fields {
  const message = value as Fields | null;
  return (
    typeof message === 'object' &&
    message !== null &&
    message['source'] === ɵNG_DOC_DEMO_MESSAGE_SOURCE &&
    message['version'] === 1 &&
    message['type'] === type
  );
}

function isRecord(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRevision(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** Whether every value of a record decodes: a malformed value is a malformed message. */
function isEncodedRecord(value: unknown): value is Record<string, ɵNgDocPlaygroundEncodedValue> {
  if (!isRecord(value)) return false;
  try {
    for (const item of Object.values(value)) ɵdecodePlaygroundValue(item);
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether a message is a state for the frame of an isolated playground.
 * @param value - The data of a `message` event.
 * @internal
 */
export function ɵisNgDocPlaygroundStateMessage(
  value: unknown,
): value is ɵNgDocPlaygroundStateMessage {
  return (
    header(value, 'playground-state') &&
    isRevision(value['revision']) &&
    isEncodedRecord(value['properties']) &&
    isRecord(value['content']) &&
    Object.values(value['content']).every((shown) => typeof shown === 'boolean') &&
    typeof value['recreate'] === 'boolean'
  );
}

/**
 * Whether a message comes from the frame of an isolated playground, and is one it sends.
 * @param value - The data of a `message` event.
 * @internal
 */
export function ɵisNgDocPlaygroundFrameMessage(
  value: unknown,
): value is ɵNgDocPlaygroundFrameMessage {
  if (header(value, 'playground-ready')) {
    const uncloneable = value['uncloneable'];

    return (
      isEncodedRecord(value['defaults']) &&
      Array.isArray(uncloneable) &&
      uncloneable.every((name) => typeof name === 'string')
    );
  }
  if (header(value, 'playground-applied')) return isRevision(value['revision']);
  if (header(value, 'playground-error')) {
    return (
      (value['phase'] === 'create' || value['phase'] === 'apply') &&
      typeof value['message'] === 'string'
    );
  }
  return false;
}
