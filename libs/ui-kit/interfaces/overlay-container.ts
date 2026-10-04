import { Signal } from '@angular/core';
import { NgDocContent, NgDocOverlayAnimationEvent } from '@ng-doc/ui-kit/types';
import { Observable } from 'rxjs';

import { NgDocOverlayConfig } from './overlay-config';

/**
 * The component an overlay renders its content in.
 *
 * The overlay service sets `config` and `content` through the component reference's setInput
 * method, so an implementation declares both as signal inputs.
 */
export interface NgDocOverlayContainer {
  animationEvent: Observable<NgDocOverlayAnimationEvent>;
  readonly config: Signal<NgDocOverlayConfig | undefined>;
  readonly content: Signal<NgDocContent>;
  isFocused: boolean;

  close(): void;

  markForCheck(): void;

  focus(): void;
}
