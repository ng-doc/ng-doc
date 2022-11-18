import {ScrollStrategy} from '@angular/cdk/overlay';
import {DOCUMENT} from '@angular/common';
import {Inject, Injectable, NgZone} from '@angular/core';
import {toElement} from '@ng-doc/ui-kit/helpers';
import {NgDocOverlayConfig} from '@ng-doc/ui-kit/interfaces';
import {ngDocZoneDetach} from '@ng-doc/ui-kit/observables';
import {fromEvent, Subject} from 'rxjs';
import {filter, takeUntil, throttleTime} from 'rxjs/operators';

@Injectable({providedIn: 'root', })
export class NgDocOverlayStrategy implements ScrollStrategy {
	private overlayRef: any | null = null;
	private destroy$: Subject<void> = new Subject<void>();

	constructor(@Inject(DOCUMENT) private documentRef: Document, private ngZone: NgZone) {}

	attach(overlayRef: any): void {
		this.overlayRef = overlayRef;
	}

	enable(): void {
		fromEvent(this.documentRef, 'scroll', {capture: true})
			.pipe(
				ngDocZoneDetach(this.ngZone),
				throttleTime(10),
				filter((scrollEvent: Event) =>
					scrollEvent.target instanceof Node
						? scrollEvent.target.contains(this.origin) || !this.origin
						: false,
				),
				takeUntil(this.destroy$),
			)
			.subscribe(() => this.overlayRef.updatePosition());
	}

	private get origin(): HTMLElement | null {
		const config: NgDocOverlayConfig | undefined = this.overlayRef?.getConfig() as NgDocOverlayConfig;
		return config?.viewContainerRef ? (toElement(config.viewContainerRef.element) as HTMLElement) : null;
	}

	disable(): void {
		this.destroy$.next();
	}

	detach(): void {
		this.disable();
		if (this.overlayRef?.hasAttached()) {
			this.ngZone.run(() => {
				this.overlayRef?.detach();
			});
		}
	}
}
