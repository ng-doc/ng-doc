import { LocationStrategy } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  OnInit,
  Renderer2,
} from '@angular/core';
import { NgDocCopyButtonComponent } from '@ng-doc/app/components/copy-button';
import { ɵngDocPageUrl } from '@ng-doc/app/helpers';
import { NgDocIconComponent } from '@ng-doc/ui-kit';
import { WA_LOCATION } from '@ng-web-apis/common';

/**
 * Button next to a heading that copies the link to the heading.
 */
@Component({
  selector: 'ng-doc-heading-anchor',
  imports: [NgDocIconComponent, NgDocCopyButtonComponent],
  template: `
    <ng-doc-copy-button [text]="href" label="Copy link to section">
      <ng-doc-icon icon="link-2"></ng-doc-icon>
    </ng-doc-copy-button>
  `,
  styles: ``,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': 'classes()',
  },
})
export class NgDocHeadingAnchorComponent implements OnInit {
  /** Id of the heading. */
  readonly anchor = input.required<string>();

  /** Classes of the host element. */
  readonly classes = input<string[]>([]);

  protected readonly location = inject(WA_LOCATION);

  private readonly locationStrategy = inject(LocationStrategy);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly renderer = inject(Renderer2);

  // Read when the button is pressed: the location is not a signal, and the link must use the
  // route the reader is on, in the form the location strategy shows it.
  protected readonly href = (): string =>
    ɵngDocPageUrl(this.locationStrategy, this.location, this.anchor());

  /**
   * Names the heading after its own text: the anchor sits inside the heading, so the button's
   * label would otherwise end the heading's accessible name ("Installation Copy link to
   * section"). The heading's other content moves into a span that the heading is labelled by, so
   * the name follows that content and leaves out whatever it hides from assistive technology.
   * The processors insert the anchor before its first change detection, on the server as in the
   * browser, so the heading is its parent here.
   * @internal
   */
  ngOnInit(): void {
    const heading = this.host.parentElement;

    if (
      !heading ||
      !/^H[1-6]$/.test(heading.tagName) ||
      heading.hasAttribute('aria-label') ||
      heading.hasAttribute('aria-labelledby')
    )
      return;

    const id = `ng-doc-heading-label-${heading.id || this.anchor()}`;
    const label: HTMLElement = this.renderer.createElement('span');

    this.renderer.setAttribute(label, 'id', id);
    this.renderer.setAttribute(label, 'class', 'ng-doc-heading-label');
    for (const node of Array.from(heading.childNodes)) {
      if (node !== this.host) this.renderer.appendChild(label, node);
    }
    this.renderer.insertBefore(heading, label, this.host);
    this.renderer.setAttribute(heading, 'aria-labelledby', id);
  }
}
