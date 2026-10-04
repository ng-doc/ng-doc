import { InjectionToken } from '@angular/core';

/**
 * A keyboard shortcut registered with the NgDocShortcutsService.
 */
export interface NgDocShortcut {
  /**
   * The key that runs the shortcut, compared with the key of the keyboard event without regard to
   * case, for example '/', '[' or 'f'.
   */
  key: string;
  /**
   * Whether the shortcut is a chord with the Command key (macOS) or the Control key (elsewhere).
   * Chords always work: in text fields too, and when single-key shortcuts are turned off. Other
   * shortcuts are single keys: they run only while single-key shortcuts are on, never while the
   * reader types in a field, and never with Command, Control or Alt held.
   */
  chord?: boolean;
  /**
   * Runs the shortcut. The default action of the keyboard event is prevented before it runs. The
   * event is missing when the shortcut runs from the search palette.
   */
  handler: (event?: KeyboardEvent) => void;
}

/**
 * Whether single-key shortcuts are on for readers who have not turned them on or off themselves.
 * The default is true. Set it with the shortcuts option of provideNgDocApp.
 */
export const NG_DOC_SHORTCUTS: InjectionToken<boolean> = new InjectionToken<boolean>(
  'NG_DOC_SHORTCUTS',
  { factory: () => true },
);

/**
 * The local storage key that keeps a reader's choice to turn single-key shortcuts on ("1") or off
 * ("0").
 */
export const NG_DOC_STORE_SHORTCUTS_KEY: string = 'ng-doc-shortcuts';
