import {
  ConnectedOverlayPositionChange,
  FlexibleConnectedPositionStrategy,
} from '@angular/cdk/overlay';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DOCUMENT,
  ElementRef,
  HostBinding,
  inject,
  Input,
  NgZone,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { NgDocFocusControlComponent } from '@ng-doc/ui-kit/components/focus-control';
import { NgDocOverlayPointerComponent } from '@ng-doc/ui-kit/components/overlay-pointer';
import { NgDocEventSwitcherDirective } from '@ng-doc/ui-kit/directives/event-switcher';
import { NgDocFocusCatcherDirective } from '@ng-doc/ui-kit/directives/focus-catcher';
import { toElement } from '@ng-doc/ui-kit/helpers';
import { NgDocOverlayConfig, NgDocOverlayContainer } from '@ng-doc/ui-kit/interfaces';
import { ngDocZoneOptimize } from '@ng-doc/ui-kit/observables';
import {
  NgDocContent,
  NgDocHorizontalAlign,
  NgDocOverlayAnimationEvent,
  NgDocOverlayPosition,
  NgDocOverlayRelativePosition,
  NgDocVerticalAlign,
} from '@ng-doc/ui-kit/types';
import { NgDocFocusUtils, NgDocOverlayUtils } from '@ng-doc/ui-kit/utils';
import { PolymorpheusModule, PolymorpheusOutletDirective } from '@tinkoff/ng-polymorpheus';
import { Observable, Subject } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';

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
    PolymorpheusModule,
  ],
})
export class NgDocOverlayContainerComponent
  implements NgDocOverlayContainer, OnInit, AfterViewInit, OnDestroy
{
  private elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private documentRef = inject<Document>(DOCUMENT);
  private changeDetectorRef = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);

  @Input()
  content: NgDocContent = '';

  @Input()
  config?: NgDocOverlayConfig;

  @ViewChild('contentContainer', { read: ElementRef, static: true })
  contentContainer?: ElementRef<HTMLElement>;

  @ViewChild(NgDocFocusCatcherDirective)
  focusCatcher?: NgDocFocusCatcherDirective;

  @ViewChild(PolymorpheusOutletDirective, { static: true })
  outlet?: PolymorpheusOutletDirective<object>;

  @HostBinding('attr.data-ng-doc-overlay-position')
  relativePosition: NgDocOverlayRelativePosition | null = null;

  private currentPosition?: NgDocOverlayPosition;
  private animationEvent$: Subject<NgDocOverlayAnimationEvent> =
    new Subject<NgDocOverlayAnimationEvent>();
  private isOpened: boolean = true;

  constructor() {}

  ngOnInit(): void {
    if (this.config?.positionStrategy instanceof FlexibleConnectedPositionStrategy) {
      this.config.positionStrategy.positionChanges
        .pipe(
          distinctUntilChanged(
            (a: ConnectedOverlayPositionChange, b: ConnectedOverlayPositionChange) =>
              a.connectionPair === b.connectionPair,
          ),
          ngDocZoneOptimize(this.ngZone),
        )
        .subscribe((change: ConnectedOverlayPositionChange) => {
          this.currentPosition = NgDocOverlayUtils.getOverlayPosition(change.connectionPair);
          this.relativePosition = NgDocOverlayUtils.getRelativePosition(this.currentPosition);
          this.changeDetectorRef.markForCheck();
        });
    }
  }

  ngAfterViewInit(): void {
    const [keyframes, options] = this.config?.openAnimation || [];
    this.runAnimation(keyframes ?? [], options);
  }

  @HostBinding('attr.data-ng-doc-overlay-with-contact-border')
  get contactBorder(): boolean {
    return !!this.config?.contactBorder;
  }

  get isFocused(): boolean {
    return !!this.focusCatcher?.focused;
  }

  get animationEvent(): Observable<NgDocOverlayAnimationEvent> {
    return this.animationEvent$.asObservable();
  }

  get overlayAlign(): NgDocHorizontalAlign | NgDocVerticalAlign | null {
    return this.currentPosition
      ? NgDocOverlayUtils.getPositionAlign(
          NgDocOverlayUtils.toConnectedPosition(this.currentPosition),
        )
      : null;
  }

  close(): void {
    if (this.isOpened) {
      const [keyframes, options] = this.config?.closeAnimation || [];
      this.runAnimation(keyframes ?? [], options, true);
      this.isOpened = false;
      this.changeDetectorRef.markForCheck();
    }
  }

  focus(): void {
    if (this.contentContainer) {
      NgDocFocusUtils.focusClosestElement(
        toElement(this.contentContainer),
        toElement(this.contentContainer),
      );
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

    this.elementRef.nativeElement
      .animate(keyframes, options)
      .finished.then(() => this.animationEvent$.next(close ? 'afterClose' : 'afterOpen'));
  }

  ngOnDestroy(): void {
    if (this.isFocused && this.config && this.config.viewContainerRef) {
      NgDocFocusUtils.focusClosestElement(
        this.config.viewContainerRef.element.nativeElement,
        this.documentRef.body,
        false,
      );
    }
  }
}
