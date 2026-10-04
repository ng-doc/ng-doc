import { inject, Service } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { notificationCloseAnimation, notificationOpenAnimation } from '@ng-doc/ui-kit/animations';
import { NgDocOverlayRef } from '@ng-doc/ui-kit/classes';
import { NgDocOverlayContainerComponent } from '@ng-doc/ui-kit/components/overlay-container';
import { NgDocOverlayService } from '@ng-doc/ui-kit/services/overlay';
import { NgDocContent } from '@ng-doc/ui-kit/types';
import { Subject, timer } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';

/**
 * Shows short notifications at the bottom of the viewport. A new notification replaces the
 * current one, and each closes after two seconds.
 */
@Service()
export class NgDocNotifyService {
  private readonly overlayService = inject(NgDocOverlayService);

  private overlayRef?: NgDocOverlayRef;
  private readonly notify$: Subject<NgDocContent> = new Subject<NgDocContent>();

  constructor() {
    this.notify$
      .pipe(
        tap(() => this.overlayRef?.close()),
        tap((content: NgDocContent) => this.openOverlay(content)),
        switchMap(() => timer(2000)),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.overlayRef?.close());
  }

  /**
   * Shows a notification.
   * @param content - Content of the notification.
   */
  notify(content: NgDocContent): void {
    this.notify$.next(content);
  }

  private openOverlay(content: NgDocContent): void {
    this.overlayRef = this.overlayService.open(content, {
      overlayContainer: NgDocOverlayContainerComponent,
      panelClass: 'ng-doc-notify',
      positionStrategy: this.overlayService
        .globalPositionStrategy()
        .bottom('10px')
        .centerHorizontally(),
      openAnimation: notificationOpenAnimation,
      closeAnimation: notificationCloseAnimation,
    });
  }
}
