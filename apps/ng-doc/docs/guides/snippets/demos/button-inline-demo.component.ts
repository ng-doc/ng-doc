import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NgDocButtonComponent } from '@ng-doc/ui-kit';
import { NgDocNotifyService } from '@ng-doc/ui-kit/services/notify';

// snippet-from-file="../ng-doc.page.ts"

@Component({
  selector: 'ng-doc-button-inline-demo',
  standalone: true,
  imports: [NgDocButtonComponent],
  template: `
    <!-- snippet "Button Template" icon="angular" -->
    <button ng-doc-button-flat (click)="clickEvent()">Just a button</button>
    <!-- snippet -->
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ButtonInlineDemoComponent {
  // snippet "Injecting NotificationService" opened
  constructor(private readonly notifyService: NgDocNotifyService) {}

  // snippet

  clickEvent(): void {
    // snippet "Open Notification"
    this.notifyService.notify('Button was clicked!');
    // snippet
  }
}
