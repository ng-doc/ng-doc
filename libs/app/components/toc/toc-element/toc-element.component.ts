import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  numberAttribute,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgDocDecodeUriComponentPipe } from '@ng-doc/app/pipes/decode-uri-component';

/**
 * One entry of the table of contents: a link to a heading of the page.
 */
@Component({
  selector: 'li[ng-doc-toc-element]',
  templateUrl: './toc-element.component.html',
  styleUrls: ['./toc-element.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NgDocDecodeUriComponentPipe],
  host: {
    '[attr.data-ng-doc-selected]': 'selected()',
    '[attr.data-ng-doc-level]': 'level()',
  },
})
export class NgDocTocElementComponent {
  /** Path of the page that holds the heading. */
  readonly path = input<string>('');

  /** Id of the heading, used as the link's fragment. */
  readonly hash = input<string>('');

  /** Whether the heading is the section the reader is in. */
  readonly selected = input<boolean, unknown>(false, { transform: booleanAttribute });

  /** Depth of the heading in the table of contents, from 1. */
  readonly level = input<number, unknown>(1, { transform: numberAttribute });

  /** The list item element. */
  readonly elementRef: ElementRef<HTMLElement> = inject(ElementRef);
}
