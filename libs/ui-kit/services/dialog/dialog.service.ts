import { GlobalPositionStrategy } from '@angular/cdk/overlay';
import { inject, Injectable, InjectionToken } from '@angular/core';
import { asArray } from '@ng-doc/core';
import { NgDocOverlayRef } from '@ng-doc/ui-kit/classes';
import { NgDocOverlayContainerComponent } from '@ng-doc/ui-kit/components/overlay-container';
import { NgDocOverlayService } from '@ng-doc/ui-kit/services/overlay';
import { NgDocContent } from '@ng-doc/ui-kit/types';

import { NgDocDialogConfig } from './dialog.config';

export const NG_DOC_DIALOG_DATA = new InjectionToken<unknown>('NG_DOC_DIALOG_DATA');

@Injectable({
  providedIn: 'root',
})
export class NgDocDialogService {
  protected overlayService: NgDocOverlayService = inject(NgDocOverlayService);

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

  positionStrategy(): GlobalPositionStrategy {
    return this.overlayService.globalPositionStrategy();
  }
}
