import { ɵNG_DOC_DEMO_MESSAGE_SOURCE } from './demo-message';
import { ɵdecodePlaygroundValue, ɵNgDocPlaygroundEncodedValue } from './playground-value';

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
 * The message the frame of an isolated playground sends once it has applied the state of its URL
 * fragment.
 * @internal
 */
export interface ɵNgDocPlaygroundAppliedMessage {
  readonly source: typeof ɵNG_DOC_DEMO_MESSAGE_SOURCE;
  readonly version: 1;
  readonly type: 'playground-applied';
  /** The URL fragment of the state it applied, without `#`. */
  readonly fragment: string;
}

/**
 * The message the frame of an isolated playground sends when its target throws while it is
 * created or while it takes a state, or when its URL fragment is malformed.
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

/**
 *
 * @param value
 * @param type
 */
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

/**
 *
 * @param value
 */
function isRecord(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Whether every value of a record decodes: a malformed value is a malformed message.
 * @param value
 */
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
  if (header(value, 'playground-applied')) return typeof value['fragment'] === 'string';
  if (header(value, 'playground-error')) {
    return (
      (value['phase'] === 'create' || value['phase'] === 'apply') &&
      typeof value['message'] === 'string'
    );
  }
  return false;
}
