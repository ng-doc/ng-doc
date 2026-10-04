import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { NgDocButtonComponent, NgDocColor } from '@ng-doc/ui-kit';
import { NgDocNotifyService } from '@ng-doc/ui-kit/services/notify';

@Component({
  selector: 'ng-doc-button-demo',
  imports: [NgDocButtonComponent],
  templateUrl: './button-demo.component.html',
  styleUrls: ['./button-demo.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ButtonDemoComponent {
  private readonly notifyService = inject(NgDocNotifyService);

  readonly color = input<NgDocColor>('primary');

  clickEvent(): void {
    this.notifyService.notify('Button was clicked!');
  }
}
