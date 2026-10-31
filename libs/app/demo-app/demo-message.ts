/**
 * The `source` of every message the demo application sends to the page that embeds it.
 * @internal
 */
export const ɵNG_DOC_DEMO_MESSAGE_SOURCE = 'ng-doc-demo';

/**
 * The message an isolated demo sends to the page that shows it in an iframe whenever the height
 * of its content changes, so that the iframe takes that height.
 * @internal
 */
export interface ɵNgDocDemoSizeMessage {
  readonly source: typeof ɵNG_DOC_DEMO_MESSAGE_SOURCE;
  readonly version: 1;
  readonly type: 'size';
  /** The height of the demo's content, in CSS pixels, rounded up. */
  readonly height: number;
}

/**
 * Whether a message is a size message of the demo application.
 * @param value - The data of a `message` event.
 * @internal
 */
export function ɵisNgDocDemoSizeMessage(value: unknown): value is ɵNgDocDemoSizeMessage {
  const message = value as Partial<ɵNgDocDemoSizeMessage> | null;
  return (
    typeof message === 'object' &&
    message !== null &&
    message.source === ɵNG_DOC_DEMO_MESSAGE_SOURCE &&
    message.version === 1 &&
    message.type === 'size' &&
    typeof message.height === 'number' &&
    Number.isFinite(message.height) &&
    message.height >= 0
  );
}

/**
 * The message an isolated demo sends to the page that shows it in an iframe whenever the background
 * of its page changes, such as when its theme changes, so that the page can paint the canvas
 * around the iframe in it.
 * @internal
 */
export interface ɵNgDocDemoBackgroundMessage {
  readonly source: typeof ɵNG_DOC_DEMO_MESSAGE_SOURCE;
  readonly version: 1;
  readonly type: 'background';
  /** The computed background color of the demo's page, such as `rgb(24, 24, 27)`. */
  readonly color: string;
}

/**
 * Whether a message is a background message of the demo application.
 * @param value - The data of a `message` event.
 * @internal
 */
export function ɵisNgDocDemoBackgroundMessage(
  value: unknown,
): value is ɵNgDocDemoBackgroundMessage {
  const message = value as Partial<ɵNgDocDemoBackgroundMessage> | null;
  return (
    typeof message === 'object' &&
    message !== null &&
    message.source === ɵNG_DOC_DEMO_MESSAGE_SOURCE &&
    message.version === 1 &&
    message.type === 'background' &&
    typeof message.color === 'string' &&
    message.color.length > 0 &&
    message.color.length <= 200
  );
}
