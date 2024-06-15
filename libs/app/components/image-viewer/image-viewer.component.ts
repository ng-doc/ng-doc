import { animate, style } from '@angular/animations';
import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  inject,
  input,
  TemplateRef,
  viewChild,
} from '@angular/core';
import { NgDocOverlayContainerComponent, NgDocOverlayService } from '@ng-doc/ui-kit';
import { NgDocOverlayRef } from '@ng-doc/ui-kit/classes';

@Component({
  selector: 'ng-doc-image-viewer',
  standalone: true,
  imports: [NgTemplateOutlet],
  templateUrl: './image-viewer.component.html',
  styleUrl: './image-viewer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-opened]': '!!overlayRef',
  },
})
export class NgDocImageViewerComponent {
  src = input.required<string>();
  alt = input.required<string>();

  protected readonly image = viewChild('image', { read: TemplateRef });
  protected readonly overlay = inject(NgDocOverlayService);
  protected readonly element = inject(ElementRef<HTMLElement>).nativeElement;
  protected readonly changeDetectorRef = inject(ChangeDetectorRef);
  protected readonly padding = 16;
  protected overlayRef?: NgDocOverlayRef;

  @HostListener('click')
  clickEvent(): void {
    this.overlayRef?.close();

    const { width, height, top, left } = this.element.getBoundingClientRect();

    this.overlayRef = this.overlay.open(this.image(), {
      overlayContainer: NgDocOverlayContainerComponent,
      positionStrategy: this.overlay
        .globalPositionStrategy()
        .centerHorizontally()
        .centerVertically(),
      scrollStrategy: this.overlay.scrollStrategy().block(),
      hasBackdrop: true,
      backdropClass: 'ng-doc-blur-backdrop',
      openAnimation: [
        style({ position: 'fixed', width, height, top, left }),
        animate(
          '300ms cubic-bezier(0.25, 0.8, 0.25, 1)',
          style({
            width: '100%',
            height: '100%',
            top: '0',
            left: '0',
          }),
        ),
      ],
      closeAnimation: [
        style({ position: 'fixed', width: '100%', height: '100%', top: '0', left: '0' }),
        animate(
          '300ms cubic-bezier(0.25, 0.8, 0.25, 1)',
          style({
            width: width + this.padding + 2,
            height: height + this.padding * 2,
            top: top - this.padding,
            left: left - this.padding,
          }),
        ),
      ],
    });

    this.overlayRef.afterClose().subscribe(() => {
      this.overlayRef = undefined;
      this.changeDetectorRef.markForCheck();
    });
  }
}