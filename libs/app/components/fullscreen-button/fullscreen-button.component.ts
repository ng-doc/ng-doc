import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { NgDocDemoTexts } from '@ng-doc/app/interfaces';
import { NG_DOC_TEXTS } from '@ng-doc/app/tokens';
import {
  NgDocButtonComponent,
  NgDocIconComponent,
  NgDocTextComponent,
  NgDocTextRightDirective,
} from '@ng-doc/ui-kit';

/** A link that opens a demo's fullscreen route in a new tab. */
@Component({
  selector: 'ng-doc-fullscreen-button',
  templateUrl: './fullscreen-button.component.html',
  styleUrls: ['./fullscreen-button.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    NgDocTextComponent,
    NgDocIconComponent,
    NgDocTextRightDirective,
    NgDocButtonComponent,
  ],
})
export class NgDocFullscreenButtonComponent {
  protected readonly texts: NgDocDemoTexts = inject(NG_DOC_TEXTS).demo;

  /** Route of the fullscreen demo. */
  readonly route = input.required<string>();
}
