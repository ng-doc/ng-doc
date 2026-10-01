import {
  ConnectedOverlayPositionChange,
  FlexibleConnectedPositionStrategy,
} from '@angular/cdk/overlay';
import { isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  DestroyRef,
  DOCUMENT,
  ElementRef,
  inject,
  input,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgDocFocusControlComponent } from '@ng-doc/ui-kit/components/focus-control';
import { NgDocOverlayPointerComponent } from '@ng-doc/ui-kit/components/overlay-pointer';
import { NgDocEventSwitcherDirective } from '@ng-doc/ui-kit/directives/event-switcher';
import { NgDocFocusCatcherDirective } from '@ng-doc/ui-kit/directives/focus-catcher';
import { toElement } from '@ng-doc/ui-kit/helpers';
import { NgDocOverlayConfig, NgDocOverlayContainer } from '@ng-doc/ui-kit/interfaces';
import {
  NgDocContent,
  NgDocHorizontalAlign,
  NgDocOverlayAnimationEvent,
  NgDocOverlayPosition,
  NgDocOverlayRelativePosition,
  NgDocVerticalAlign,
} from '@ng-doc/ui-kit/types';
import { NgDocFocusUtils, NgDocOverlayUtils } from '@ng-doc/ui-kit/utils';
import { PolymorpheusOutlet } from '@taiga-ui/polymorpheus';
import { Observable, Subject } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';

/** The default overlay container: renders the content with the pointer and the open animation. */
@Component({
  selector: 'ng-doc-overlay-container',
  templateUrl: './overlay-container.component.html',
  styleUrls: ['./overlay-container.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgDocOverlayPointerComponent,
    NgDocEventSwitcherDirective,
    NgDocFocusControlComponent,
    NgDocFocusCatcherDirective,
    PolymorpheusOutlet,
  ],
  host: {
    '[attr.data-ng-doc-overlay-position]': 'relativePosition()',
    '[attr.data-ng-doc-overlay-with-contact-border]': 'contactBorder()',
  },
})
export class NgDocOverlayContainerComponent
  implements NgDocOverlayContainer, OnInit, AfterViewInit, OnDestroy
{
  private elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private documentRef = inject<Document>(DOCUMENT);
  private changeDetectorRef = inject(ChangeDetectorRef);
  private platformId = inject(PLATFORM_ID);
  private destroyRef = inject(DestroyRef);

  /** What the overlay renders: a string, a template or a component. */
  readonly content = input<NgDocContent>('');

  /** The configuration the overlay was opened with. */
  readonly config = input<NgDocOverlayConfig>();

  readonly contentContainer = viewChild('contentContainer', { read: ElementRef });

  readonly focusCatcher = viewChild(NgDocFocusCatcherDirective);

  readonly outlet = viewChild(PolymorpheusOutlet);

  private readonly currentPosition = signal<NgDocOverlayPosition | null>(null);

  /** The side of the origin the overlay is on, once the position strategy has placed it. */
  protected readonly relativePosition = computed<NgDocOverlayRelativePosition | null>(() => {
    const position: NgDocOverlayPosition | null = this.currentPosition();

    return position ? NgDocOverlayUtils.getRelativePosition(position) : null;
  });

  protected readonly overlayAlign = computed<NgDocHorizontalAlign | NgDocVerticalAlign | null>(
    () => {
      const position: NgDocOverlayPosition | null = this.currentPosition();

      return position
        ? NgDocOverlayUtils.getPositionAlign(NgDocOverlayUtils.toConnectedPosition(position))
        : null;
    },
  );

  protected readonly contactBorder = computed<boolean>(() => !!this.config()?.contactBorder);

  private animationEvent$: Subject<NgDocOverlayAnimationEvent> =
    new Subject<NgDocOverlayAnimationEvent>();
  private isOpened: boolean = true;

  ngOnInit(): void {
    const positionStrategy = this.config()?.positionStrategy;

    if (positionStrategy instanceof FlexibleConnectedPositionStrategy) {
      // The strategy may report a position outside the Angular zone; writing a signal schedules
      // change detection with and without zone.js.
      positionStrategy.positionChanges
        .pipe(
          distinctUntilChanged(
            (a: ConnectedOverlayPositionChange, b: ConnectedOverlayPositionChange) =>
              a.connectionPair === b.connectionPair,
          ),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe((change: ConnectedOverlayPositionChange) =>
          this.currentPosition.set(NgDocOverlayUtils.getOverlayPosition(change.connectionPair)),
        );
    }
  }

  ngAfterViewInit(): void {
    const [keyframes, options] = this.config()?.openAnimation || [];
    this.runAnimation(keyframes ?? [], options);
  }

  get isFocused(): boolean {
    return !!this.focusCatcher()?.focused;
  }

  get animationEvent(): Observable<NgDocOverlayAnimationEvent> {
    return this.animationEvent$.asObservable();
  }

  close(): void {
    if (this.isOpened) {
      const [keyframes, options] = this.config()?.closeAnimation || [];
      this.runAnimation(keyframes ?? [], options, true);
      this.isOpened = false;
      this.changeDetectorRef.markForCheck();
    }
  }

  focus(): void {
    const contentContainer: ElementRef<HTMLElement> | undefined = this.contentContainer();

    if (contentContainer) {
      NgDocFocusUtils.focusClosestElement(toElement(contentContainer), toElement(contentContainer));
    }
  }

  markForCheck(): void {
    this.changeDetectorRef.markForCheck();
  }

  private runAnimation(
    keyframes: Keyframe[] | PropertyIndexedKeyframes,
    options?: KeyframeAnimationOptions,
    close: boolean = false,
  ): void {
    this.animationEvent$.next(close ? 'beforeClose' : 'beforeOpen');

    if (!isPlatformBrowser(this.platformId)) {
      this.animationEvent$.next(close ? 'afterClose' : 'afterOpen');
      return;
    }

    this.elementRef.nativeElement
      .animate(keyframes, options)
      .finished.then(() => this.animationEvent$.next(close ? 'afterClose' : 'afterOpen'));
  }

  ngOnDestroy(): void {
    const config: NgDocOverlayConfig | undefined = this.config();

    if (this.isFocused && config && config.viewContainerRef) {
      NgDocFocusUtils.focusClosestElement(
        config.viewContainerRef.element.nativeElement,
        this.documentRef.body,
        false,
      );
    }
  }
}
