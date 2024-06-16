import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostBinding,
  inject,
  Input,
} from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'li[ng-doc-toc-element]',
  templateUrl: './toc-element.component.html',
  styleUrls: ['./toc-element.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [RouterLink],
})
export class NgDocTocElementComponent {
  @Input()
  path: string = '';

  @Input()
  hash: string = '';

  @Input()
  @HostBinding('attr.data-ng-doc-selected')
  selected: boolean = false;

  @Input()
  @HostBinding('attr.data-ng-doc-level')
  level: number = 1;

  readonly elementRef: ElementRef<HTMLElement> = inject(ElementRef);
}
