import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { NgDocCodeComponent } from '@ng-doc/app/components/code';
import { NgDocCopyButtonComponent } from '@ng-doc/app/components/copy-button';
import { NgDocCodeHighlighterDirective } from '@ng-doc/app/directives/code-highlighter';
import {
  NgDocButtonIconComponent,
  NgDocContent,
  NgDocExpanderComponent,
  NgDocIconComponent,
  NgDocTooltipDirective,
} from '@ng-doc/ui-kit';

let nextId = 0;

/**
 * A demo on the dot-grid stage with a copy button and a toggle that reveals its code below it
 * (the rows of a playground use it).
 */
@Component({
  selector: 'ng-doc-demo-displayer',
  templateUrl: './demo-displayer.component.html',
  styleUrls: ['./demo-displayer.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    NgDocButtonIconComponent,
    NgDocTooltipDirective,
    NgDocIconComponent,
    NgDocExpanderComponent,
    NgDocCodeComponent,
    NgDocCodeHighlighterDirective,
    NgDocCopyButtonComponent,
  ],
  host: {
    '[attr.data-ng-doc-border]': 'border()',
  },
})
export class NgDocDemoDisplayerComponent {
  /** Content shown when the code is revealed; when empty, the highlighted `code` is shown. */
  readonly codeContent = input<NgDocContent>('');

  /** Code of the demo, copied by the copy button and shown when there is no `codeContent`. */
  readonly code = input<string>('');

  /** Language of `code`. */
  readonly language = input<string>('typescript');

  /** Whether the demo is shown in the stage with its controls; otherwise it is shown as is. */
  readonly container = input<boolean>(true);

  /** Whether the displayer draws its border. */
  readonly border = input<boolean>(true);

  /** Whether the code is revealed. */
  readonly expanded = model<boolean>(false);

  /** Id of the region that holds the code, for the toggle's `aria-controls`. */
  protected readonly codeId: string = `ng-doc-demo-displayer-code-${nextId++}`;

  /** Reveals or hides the code. */
  toggle(): void {
    this.expanded.update((expanded: boolean) => !expanded);
  }
}
