import { animate, group, query, style } from '@angular/animations';
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
  protected overlayRef?: NgDocOverlayRef;

  @HostListener('click')
  clickEvent(): void {
    this.overlayRef?.close();

    const { width, height, top, left } = this.element.getBoundingClientRect();
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const ratio = Math.min(windowWidth / width, windowHeight / height);
    const newWidth = width * ratio;
    const newHeight = height * ratio;

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
        style({ position: 'fixed', width, height, top, left, transform: 'translate(0%, 0)' }),
        group([
          animate(
            '300ms cubic-bezier(0.25, 0.8, 0.25, 1)',
            style({
              width: `${newWidth}px`,
              height: `${newHeight}px`,
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
            }),
          ),
          query('.ng-doc-image-container', [
            style({ padding: 0 }),
            animate('300ms cubic-bezier(0.25, 0.8, 0.25, 1)', style({ padding: '16px' })),
          ]),
        ]),
      ],
      closeAnimation: [
        style({
          position: 'fixed',
          width: `${newWidth}px`,
          height: `${newHeight}px`,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        }),
        group([
          animate(
            '300ms cubic-bezier(0.25, 0.8, 0.25, 1)',
            style({ width, height, top, left, transform: 'translate(0%, 0)' }),
          ),
          query(
            '.ng-doc-image-container',
            animate('300ms cubic-bezier(0.25, 0.8, 0.25, 1)', style({ padding: 0 })),
          ),
        ]),
      ],
    });

    this.overlayRef.afterClose().subscribe(() => {
      this.overlayRef = undefined;
      this.changeDetectorRef.markForCheck();
    });
  }
}
