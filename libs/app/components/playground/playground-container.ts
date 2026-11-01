import { InjectionToken, Signal, WritableSignal } from '@angular/core';

/**
 * What a generated playground class needs from the playground that shows it: the target's inputs
 * (the order of a pipe's parameters) and the place to report the target's default input values.
 * The playground on the documentation page provides it, and so does the page of an isolated
 * playground in the demo application, which shows the class without the rest of the playground.
 * @internal
 */
export interface ɵNgDocPlaygroundContainer {
  /** The inputs of the target, by name: only the names, in order, are read. */
  readonly properties: Signal<Readonly<Record<string, unknown>> | undefined>;
  /** The default values of the target's inputs, reported by the first class created. */
  readonly defaultValues: WritableSignal<Record<string, unknown> | undefined>;
}

/**
 * The playground that shows a generated playground class.
 * @internal
 */
export const ɵNG_DOC_PLAYGROUND_CONTAINER = new InjectionToken<ɵNgDocPlaygroundContainer>(
  'NG_DOC_PLAYGROUND_CONTAINER',
);
