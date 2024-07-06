import { ChangeDetectionStrategy, Component, inject, Input } from '@angular/core';
import { NgDocCopyButtonComponent } from '@ng-doc/app/components/copy-button';
import { NgDocButtonIconComponent, NgDocIconComponent } from '@ng-doc/ui-kit';
import { LOCATION } from '@ng-web-apis/common';

@Component({
  selector: 'ng-doc-heading-anchor',
  standalone: true,
  imports: [NgDocButtonIconComponent, NgDocIconComponent, NgDocCopyButtonComponent],
  template: `
    <ng-doc-copy-button [text]="href">
      <ng-doc-icon icon="link-2"></ng-doc-icon>
    </ng-doc-copy-button>
  `,
  styles: ``,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocHeadingAnchorComponent {
  @Input({ required: true })
  anchor!: string;

  protected readonly location = inject(LOCATION);

  protected get href(): string {
    const { origin, pathname } = this.location;

    return `${origin}${pathname}#${this.anchor}`;
  }
}
