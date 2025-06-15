import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NgDocButtonComponent } from '@ng-doc/ui-kit';
import { NgDocNotifyService } from '@ng-doc/ui-kit/services/notify';

@Component({
  selector: 'ng-doc-button-demo',
  templateUrl: './button-demo.component.html',
  styleUrls: ['./button-demo.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [NgDocButtonComponent],
})
export class ButtonDemoComponent {
  private readonly notifyService = inject(NgDocNotifyService);

  /** Inserted by Angular inject() migration for backwards compatibility */
  constructor(...args: unknown[]);

  constructor() {}

  clickEvent(): void {
    this.notifyService.notify('Button was clicked!');
  }
}
