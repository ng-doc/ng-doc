import { Direction, Directionality } from '@angular/cdk/bidi';
import { OverlayConfig } from '@angular/cdk/overlay';
import { NgDocOverlayOrigin, NgDocOverlayPosition } from '@ng-doc/ui-kit/types';

export interface NgDocOverlayProperties {
  origin?: NgDocOverlayOrigin;
  positions?: NgDocOverlayPosition | NgDocOverlayPosition[];
  closeIfOutsideClick?: boolean;
  closeIfInnerClick?: boolean;
  withPointer?: boolean;
  contactBorder?: boolean;
  borderOffset?: number;
  panelClass?: string | string[];
  width?: number | string;
  height?: number | string;
  minWidth?: number | string;
  minHeight?: number | string;
  maxWidth?: number | string;
  maxHeight?: number | string;
  direction?: Direction | Directionality;
  /**
   * Closes the overlay when the user navigates. It is passed to the CDK overlay unchanged, so it
   * has the type of `OverlayConfig.disposeOnNavigation` of the installed `@angular/cdk`: `boolean`
   * up to 22.1, and `boolean | 'url-change' | 'pop-state'` from 22.2, where `true` means
   * `'pop-state'` (only the browser's back and forward buttons) and `'url-change'` closes it on any
   * URL change.
   *
   * The type follows the CDK so that `NgDocOverlayConfig`, which extends both this interface and
   * `OverlayConfig`, compiles with every supported CDK version.
   */
  disposeOnNavigation?: OverlayConfig['disposeOnNavigation'];
  disposeOnRouteNavigation?: boolean;
}
