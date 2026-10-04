import { Point } from '@angular/cdk/drag-drop';
import {
  CdkOverlayOrigin,
  FlexibleConnectedPositionStrategy,
  PositionStrategy,
} from '@angular/cdk/overlay';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  input,
  OnChanges,
  OnDestroy,
  output,
  signal,
  SimpleChanges,
  untracked,
  ViewContainerRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { asArray } from '@ng-doc/core/helpers/as-array';
import { dropdownOpenAnimation } from '@ng-doc/ui-kit/animations';
import { NgDocOverlayHost } from '@ng-doc/ui-kit/classes/overlay-host';
import { NgDocOverlayRef } from '@ng-doc/ui-kit/classes/overlay-ref';
import { NgDocOverlayContainerComponent } from '@ng-doc/ui-kit/components/overlay-container';
import { mergeOverlayConfigs, toElement } from '@ng-doc/ui-kit/helpers';
import { NgDocOverlayConfig, NgDocOverlayProperties } from '@ng-doc/ui-kit/interfaces';
import { NgDocOverlayService } from '@ng-doc/ui-kit/services/overlay';
import { NgDocContent, NgDocOverlayOrigin, NgDocOverlayPosition } from '@ng-doc/ui-kit/types';
import { NgDocOverlayUtils } from '@ng-doc/ui-kit/utils';

/**
 * Renders its content in an overlay connected to an origin: the `origin` input, or the
 * surrounding `ngDocDropdownOrigin`.
 */
@Component({
  selector: 'ng-doc-dropdown',
  template: ``,
  styleUrls: ['./dropdown.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [NgDocOverlayService],
  host: {
    '[attr.tabIndex]': 'isOpened ? 0 : -1',
    '(focus)': 'focus()',
  },
})
export class NgDocDropdownComponent implements OnChanges, OnDestroy {
  protected changeDetectorRef = inject(ChangeDetectorRef);
  protected overlayService = inject(NgDocOverlayService);
  protected viewContainerRef = inject(ViewContainerRef);
  protected overlayHost = inject<NgDocOverlayHost>(NgDocOverlayHost, { optional: true });
  private readonly destroyRef = inject(DestroyRef);

  /** What the dropdown renders: a string, a template or a component. */
  readonly content = input<NgDocContent>('');

  /**
   * The origin to connect to. When it changes to `null`, the dropdown stays connected to the
   * previous origin.
   */
  readonly origin = input<CdkOverlayOrigin | Point | null>(null);

  readonly closeIfOutsideClick = input<boolean>(true);

  readonly closeIfInnerClick = input<boolean>(false);

  readonly withArrow = input<boolean>(false);

  readonly borderOffset = input<number>(-8);

  readonly panelClass = input<string | string[]>([]);

  readonly contactBorder = input<boolean>(true);

  readonly hasBackdrop = input<boolean>(false);

  readonly positions = input<NgDocOverlayPosition | NgDocOverlayPosition[]>([
    'bottom-center',
    'top-center',
    'right-center',
    'left-center',
  ]);

  readonly minHeight = input<number | string>('');

  readonly maxHeight = input<number | string>('');

  readonly height = input<number | string>('');

  readonly minWidth = input<number | string>('');

  readonly maxWidth = input<number | string>('');

  readonly width = input<number | string>('');

  /** Emits when the dropdown starts opening. */
  readonly beforeOpen = output<void>();

  /** Emits when the open animation has finished. */
  readonly afterOpen = output<void>();

  /** Emits when the dropdown starts closing. */
  readonly beforeClose = output<void>();

  /** Emits when the dropdown has closed. */
  readonly afterClose = output<void>();

  overlay: NgDocOverlayRef | null = null;

  // The last origin bound to the input that was not null. It is recorded in ngOnChanges, so that
  // every change is seen, including changes while the dropdown is closed.
  private readonly lastOrigin = signal<CdkOverlayOrigin | Point | null>(null);

  // The defaults the other inputs are compared with; declared after `lastOrigin`, which it reads.
  overlayProperties: NgDocOverlayProperties = this.getOverlayProperties();

  ngOnChanges({ origin }: SimpleChanges): void {
    if (origin?.currentValue) {
      this.lastOrigin.set(origin.currentValue);
    }

    if (origin && origin.currentValue !== origin.previousValue && this.overlay) {
      const positionStrategy: PositionStrategy | undefined =
        this.overlay.overlayRef.getConfig().positionStrategy;
      if (positionStrategy instanceof FlexibleConnectedPositionStrategy && this.currentOrigin) {
        this.overlay.overlayRef.updatePositionStrategy(
          positionStrategy.setOrigin(this.currentOrigin),
        );
      }
    }
    this.updateOverlayPosition();
  }

  focus(): void {
    this.overlay?.focus();
  }

  get isFocused(): boolean {
    return !!this.overlay?.isFocused;
  }

  open(): void {
    // Opening reads the inputs; `untracked` keeps an effect that calls open() from depending on
    // them.
    untracked(() => {
      if (!this.overlay?.hasAttached) {
        const config: NgDocOverlayConfig = this.getConfig();
        const overlay: NgDocOverlayRef = this.overlayService.open(this.content(), config);

        this.overlay = overlay;
        this.beforeOpen.emit();
        // The animations can finish after the dropdown is destroyed; its outputs must not emit then.
        overlay
          .afterOpen()
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe(() => this.afterOpen.emit());
        overlay
          .beforeClose()
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe(() => {
            this.beforeClose.emit();
            this.close();
          });
        overlay
          .afterClose()
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe(() => this.afterClose.emit());

        this.changeDetectorRef.markForCheck();
      }
    });
  }

  close(): void {
    if (this.isOpened) {
      this.overlay?.close();
      this.changeDetectorRef.markForCheck();
    }
  }

  toggle(): void {
    this.isOpened ? this.close() : this.open();
  }

  get isOpened(): boolean {
    return this.overlay?.isOpened === true;
  }

  updateOverlayPosition(): void {
    if (this.overlay && this.overlay.hasAttached) {
      this.overlay.overlayRef.updateSize(this.getConfig());
      this.overlay.overlayRef.updatePosition();
    }
  }

  private get currentOrigin(): NgDocOverlayOrigin | null {
    const origin: CdkOverlayOrigin | Point | null = this.lastOrigin();

    return origin instanceof CdkOverlayOrigin
      ? (origin.elementRef.nativeElement as HTMLElement)
      : origin || this.overlayHost?.origin || null;
  }

  private getPositions(
    positions: NgDocOverlayPosition | NgDocOverlayPosition[],
    border: number,
  ): NgDocOverlayPosition[] {
    const origin: NgDocOverlayOrigin = toElement(this.currentOrigin) as HTMLElement;
    if (origin instanceof HTMLElement) {
      return NgDocOverlayUtils.getConnectedPosition(
        !!positions && asArray(positions).length
          ? positions
          : ['bottom-center', 'top-center', 'right-center', 'left-center'],
        origin,
        border * -1,
        this.withArrow(),
      );
    } else {
      return !!positions && asArray(positions).length
        ? asArray(positions)
        : ['bottom-center', 'top-center', 'right-center', 'left-center'];
    }
  }

  private getConfig(): NgDocOverlayConfig {
    const overlayProperties: NgDocOverlayProperties = mergeOverlayConfigs(
      this.overlayProperties,
      this.getOverlayProperties(),
      this.overlayHost ?? undefined,
    );
    if (!this.currentOrigin) {
      throw new Error('Origin for the dropdown was not provided.');
    }
    return {
      overlayContainer: NgDocOverlayContainerComponent,
      positionStrategy: this.overlayService.connectedPositionStrategy(
        this.currentOrigin,
        this.getPositions(overlayProperties.positions || [], overlayProperties.borderOffset || 0),
      ),
      scrollStrategy: this.overlayService.scrollStrategy().reposition(),
      viewContainerRef: this.viewContainerRef,
      openAnimation: dropdownOpenAnimation,
      hasBackdrop: this.hasBackdrop(),
      ...overlayProperties,
      panelClass: [
        'ng-doc-dropdown',
        ...asArray(this.panelClass()),
        ...asArray(this.overlayHost?.panelClass),
      ],
    };
  }

  private getOverlayProperties(): NgDocOverlayProperties {
    return {
      origin: this.currentOrigin || undefined,
      positions: this.positions(),
      closeIfOutsideClick: this.closeIfOutsideClick(),
      closeIfInnerClick: this.closeIfInnerClick(),
      withPointer: this.withArrow(),
      contactBorder: this.contactBorder(),
      borderOffset: this.borderOffset(),
      panelClass: this.panelClass(),
      width: this.width(),
      height: this.height(),
      minWidth: this.minWidth(),
      minHeight: this.minHeight(),
      maxWidth: this.maxWidth(),
      maxHeight: this.maxHeight(),
      disposeOnNavigation: true,
      disposeOnRouteNavigation: true,
    };
  }

  ngOnDestroy(): void {
    if (this.overlay) {
      this.overlay.overlayRef.dispose();
    }
  }
}
