import { OverlayRef, ScrollStrategy } from '@angular/cdk/overlay';
import { DOCUMENT, inject, Injectable, NgZone } from '@angular/core';
import { toElement } from '@ng-doc/ui-kit/helpers';
import { NgDocOverlayConfig } from '@ng-doc/ui-kit/interfaces';
import { ngDocZoneDetach } from '@ng-doc/ui-kit/observables';
import { fromEvent, Subject } from 'rxjs';
import { filter, map, takeUntil, throttleTime } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class NgDocOverlayStrategy implements ScrollStrategy {
  private documentRef = inject<Document>(DOCUMENT);
  private ngZone = inject(NgZone);

  private overlayRef: OverlayRef | null = null;
  private destroy$: Subject<void> = new Subject<void>();

  /** Inserted by Angular inject() migration for backwards compatibility */
  constructor(...args: unknown[]);

  constructor() {}

  attach(overlayRef: OverlayRef): void {
    this.overlayRef = overlayRef;
  }

  enable(): void {
    fromEvent(this.documentRef, 'scroll', { capture: true })
      .pipe(
        ngDocZoneDetach(this.ngZone),
        throttleTime(10),
        map((scrollEvent: Event) =>
          scrollEvent.target instanceof Document
            ? scrollEvent.target.scrollingElement
            : scrollEvent.target,
        ),
        filter((target: EventTarget | null) =>
          target instanceof Node ? target.contains(this.origin) || !this.origin : false,
        ),
        takeUntil(this.destroy$),
      )
      .subscribe(() => this.detach());
  }

  private get origin(): HTMLElement | null {
    const config: NgDocOverlayConfig | undefined =
      this.overlayRef?.getConfig() as NgDocOverlayConfig;
    return config?.viewContainerRef
      ? (toElement(config.viewContainerRef.element) as HTMLElement)
      : null;
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
