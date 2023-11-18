import { Injectable } from '@angular/core';
import { notificationCloseAnimation, notificationOpenAnimation } from '@ng-doc/ui-kit/animations';
import { NgDocOverlayRef } from '@ng-doc/ui-kit/classes';
import { NgDocOverlayContainerComponent } from '@ng-doc/ui-kit/components/overlay-container';
import { NgDocOverlayService } from '@ng-doc/ui-kit/services/overlay';
import { NgDocContent } from '@ng-doc/ui-kit/types';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { Subject, timer } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';

@Injectable({
	providedIn: 'root',
})
@UntilDestroy()
export class NgDocNotifyService {
	private overlayRef?: NgDocOverlayRef;
	private readonly notify$: Subject<NgDocContent> = new Subject<NgDocContent>();

	constructor(private readonly overlayService: NgDocOverlayService) {
		this.notify$
			.pipe(
				tap(() => this.overlayRef?.close()),
				tap((content: NgDocContent) => this.openOverlay(content)),
				switchMap(() => timer(2000)),
				untilDestroyed(this),
			)
			.subscribe(() => this.overlayRef?.close());
	}

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
