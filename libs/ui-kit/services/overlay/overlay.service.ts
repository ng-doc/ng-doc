import {
  FlexibleConnectedPositionStrategy,
  GlobalPositionStrategy,
  Overlay,
  OverlayRef,
  ScrollStrategyOptions,
} from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import {
  ComponentRef,
  Injectable,
  Injector,
  NgZone,
  Optional,
  StaticProvider,
} from '@angular/core';
import { Router } from '@angular/router';
import { asArray } from '@ng-doc/core/helpers/as-array';
import { NgDocOverlayRef } from '@ng-doc/ui-kit/classes';
import { NgDocOverlayConfig, NgDocOverlayContainer } from '@ng-doc/ui-kit/interfaces';
import { NgDocContent, NgDocOverlayOrigin, NgDocOverlayPosition } from '@ng-doc/ui-kit/types';
import { NgDocOverlayUtils } from '@ng-doc/ui-kit/utils';
import { PolymorpheusComponent } from '@tinkoff/ng-polymorpheus';
import { take } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class NgDocOverlayService {
  constructor(
    private overlay: Overlay,
    private ngZone: NgZone,
    private injector: Injector,
    @Optional()
    private router?: Router,
  ) {}

  open<R>(
    content: NgDocContent,
    config: NgDocOverlayConfig,
    providers: StaticProvider[] = [],
  ): NgDocOverlayRef<R> {
    const overlayRef: OverlayRef = this.createOverlay(config);
    return this.attachTooltipContainer(content, overlayRef, config, providers);
  }

  private attachTooltipContainer<R>(
    content: NgDocContent,
    overlay: OverlayRef,
    config: NgDocOverlayConfig,
    providers: StaticProvider[],
  ): NgDocOverlayRef<R> {
    const containerPortal: ComponentPortal<NgDocOverlayContainer> = new ComponentPortal(
      config.overlayContainer,
      config.viewContainerRef,
      config.viewContainerRef?.injector,
    );
    const containerRef: ComponentRef<NgDocOverlayContainer> = overlay.attach(containerPortal);
    const overlayRef: NgDocOverlayRef<R> = new NgDocOverlayRef<R>(
      overlay,
      config,
      containerRef.instance,
      this.ngZone,
      this.router,
    );

    if (content instanceof PolymorpheusComponent) {
      content = new PolymorpheusComponent(
        content.component,
        this.createInjector(overlayRef, providers, config.viewContainerRef?.injector),
      );
    }

    containerRef.setInput('config', config);
    containerRef.setInput('content', content);
    containerRef.instance.markForCheck();

    return overlayRef;
  }

  private createOverlay(config: NgDocOverlayConfig): OverlayRef {
    const overlayRef: OverlayRef = this.overlay.create(config);
    overlayRef
      .detachments()
      .pipe(take(1))
      .subscribe(() => {
        overlayRef.hasAttached() && overlayRef.detach();
      });
    return overlayRef;
  }

  connectedPositionStrategy(
    origin: NgDocOverlayOrigin,
    positions: NgDocOverlayPosition | NgDocOverlayPosition[],
  ): FlexibleConnectedPositionStrategy {
    return this.overlay
      .position()
      .flexibleConnectedTo(origin)
      .withPositions(NgDocOverlayUtils.toConnectedPositions(asArray(positions)))
      .withPush(true);
  }

  globalPositionStrategy(): GlobalPositionStrategy {
    return this.overlay.position().global();
  }

  scrollStrategy(): ScrollStrategyOptions {
    return this.overlay.scrollStrategies;
  }

  private createInjector<R>(
    overlayRef: NgDocOverlayRef<R>,
    providers: StaticProvider[],
    injector?: Injector,
  ): Injector {
    return Injector.create({
      providers: [
        ...providers,
        {
          provide: NgDocOverlayRef,
          useValue: overlayRef,
        },
      ],
      parent: injector || this.injector,
    });
  }
}
