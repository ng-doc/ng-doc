import { NgIf, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, HostBinding, Input } from '@angular/core';
import { NgDocCodeComponent } from '@ng-doc/app/components/code';
import { NgDocCopyButtonComponent } from '@ng-doc/app/components/copy-button';
import { NgDocCodeHighlighterDirective } from '@ng-doc/app/directives/code-highlighter';
import {
  NgDocButtonIconComponent,
  NgDocContent,
  NgDocExpanderComponent,
  NgDocIconComponent,
  NgDocSmoothResizeComponent,
  NgDocTooltipDirective,
} from '@ng-doc/ui-kit';

@Component({
  selector: 'ng-doc-demo-displayer',
  templateUrl: './demo-displayer.component.html',
  styleUrls: ['./demo-displayer.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [
    NgIf,
    NgTemplateOutlet,
    NgDocButtonIconComponent,
    NgDocTooltipDirective,
    NgDocSmoothResizeComponent,
    NgDocIconComponent,
    NgDocExpanderComponent,
    NgDocCodeComponent,
    NgDocCodeHighlighterDirective,
    NgDocCopyButtonComponent,
  ],
})
export class NgDocDemoDisplayerComponent {
  @Input()
  codeContent: NgDocContent = '';

  @Input()
  code: string = '';

  @Input()
  language: string = 'typescript';

  @Input()
  container: boolean = true;

  @Input()
  @HostBinding('attr.data-ng-doc-border')
  border: boolean = true;

  @Input()
  expanded: boolean = false;

  protected get expandTooltipText(): string {
    return this.expanded ? 'Collapse' : 'Expand';
  }
}
