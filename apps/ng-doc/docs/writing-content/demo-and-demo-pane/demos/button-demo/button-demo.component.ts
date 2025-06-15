import { ChangeDetectionStrategy, Component, inject, Input } from '@angular/core';
import { NgDocButtonComponent, NgDocColor } from '@ng-doc/ui-kit';
import { NgDocNotifyService } from '@ng-doc/ui-kit/services/notify';

@Component({
  selector: 'ng-doc-button-demo',
  standalone: true,
  imports: [NgDocButtonComponent],
  templateUrl: './button-demo.component.html',
  styleUrls: ['./button-demo.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ButtonDemoComponent {
  private readonly notifyService = inject(NgDocNotifyService);

  @Input()
  color: NgDocColor = 'primary';

  /** Inserted by Angular inject() migration for backwards compatibility */
  constructor(...args: unknown[]);

  constructor() {}

  clickEvent(): void {
    this.notifyService.notify('Button was clicked!');
  }
}
