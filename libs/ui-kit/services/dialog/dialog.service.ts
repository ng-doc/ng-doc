import { GlobalPositionStrategy } from '@angular/cdk/overlay';
import { inject, InjectionToken, Service } from '@angular/core';
import { asArray } from '@ng-doc/core/helpers/as-array';
import { NgDocOverlayRef } from '@ng-doc/ui-kit/classes';
import { NgDocOverlayContainerComponent } from '@ng-doc/ui-kit/components/overlay-container';
import { NgDocOverlayService } from '@ng-doc/ui-kit/services/overlay';
import { NgDocContent } from '@ng-doc/ui-kit/types';

import { NgDocDialogConfig } from './dialog.config';

/** The `data` of the dialog config, for the dialog content to inject. */
export const NG_DOC_DIALOG_DATA = new InjectionToken<unknown>('NG_DOC_DIALOG_DATA');

/** Opens dialogs: overlays centered in the viewport that block page scrolling. */
@Service()
export class NgDocDialogService {
  protected overlayService: NgDocOverlayService = inject(NgDocOverlayService);

  /**
   * Opens a dialog.
   * @param content - What the dialog renders: a string, a template or a component.
   * @param config - Overlay options; `data` is provided to the content as `NG_DOC_DIALOG_DATA`.
   * @returns The handle of the opened dialog.
   */
  open<R = unknown>(content: NgDocContent, config?: NgDocDialogConfig): NgDocOverlayRef<R> {
    return this.overlayService.open(
      content,
      {
        overlayContainer: NgDocOverlayContainerComponent,
        positionStrategy:
          config?.positionStrategy ??
          this.overlayService.globalPositionStrategy().centerHorizontally().centerVertically(),
        scrollStrategy: config?.scrollStrategy ?? this.overlayService.scrollStrategy().block(),
        ...config,
        panelClass: ['ng-doc-dialog', ...asArray(config?.panelClass)],
      },
      [{ provide: NG_DOC_DIALOG_DATA, useValue: config?.data }],
    );
  }

  /** @returns A new global position strategy, to position a dialog through its config. */
  positionStrategy(): GlobalPositionStrategy {
    return this.overlayService.globalPositionStrategy();
  }
}
