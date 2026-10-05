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
