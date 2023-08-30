import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NgDocButtonComponent } from '@ng-doc/ui-kit';
import { NgDocNotifyService } from '@ng-doc/ui-kit/services/notify';

@Component({
  selector: 'ng-doc-button-inline-demo',
  standalone: true,
  imports: [NgDocButtonComponent],
  template: `
    <!-- NgDocHTMLSnippetStart(Button Template) -->
    <button ng-doc-button-flat color="orange" (click)="clickEvent()">Just a button</button>
    <!-- NgDocHTMLSnippetEnd(Button Template) -->
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ButtonInlineDemoComponent {
  /* NgDocCodeSnippetStart(Constructor) */
  constructor(private readonly notifyService: NgDocNotifyService) {}

  /* NgDocCodeSnippetEnd(Constructor) */

  /* NgDocCodeSnippetStart(ClickEvent) */
  clickEvent(): void {
    this.notifyService.notify('Button was clicked!');
  }

  /* NgDocCodeSnippetEnd(ClickEvent) */
}
