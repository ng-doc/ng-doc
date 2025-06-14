import { animate, style, transition, trigger } from '@angular/animations';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostBinding,
  Input,
  OnChanges,
} from '@angular/core';

@Component({
  animations: [
    trigger('resizeAnimation', [
      transition('void <=> *', []),
      transition('* <=> *', [
        style({ height: '{{startHeight}}px', width: '{{startWidth}}px' }),
        animate('.225s ease-in-out'),
      ]),
    ]),
  ],
  selector: 'ng-doc-smooth-resize',
  template: ` <ng-content></ng-content>`,
  styles: [
    `
      :host {
        display: block;
        overflow: hidden;
        height: var(--ng-doc-smooth-resize-height);
        max-height: var(--ng-doc-smooth-resize-max-height);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
})
export class NgDocSmoothResizeComponent implements OnChanges {
  @Input({ required: true })
  trigger: unknown;

  @Input()
  animateOpacity: boolean = true;

  @HostBinding('@resizeAnimation')
  resizeAnimation?: {
    value: unknown;
    params: { startHeight: number; startWidth: number };
  } = {
    value: 0,
    params: { startHeight: 0, startWidth: 0 },
  };

  constructor(private readonly element: ElementRef<HTMLElement>) {}

  ngOnChanges(): void {
    this.resizeAnimation = {
      value: this.trigger,
      params: {
        startHeight: this.element.nativeElement.clientHeight || 0,
        startWidth: this.element.nativeElement.clientWidth || 0,
      },
    };
  }
}
