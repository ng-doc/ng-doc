import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
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
  @Input()
  color: NgDocColor = 'primary';

  constructor(private readonly notifyService: NgDocNotifyService) {}

  clickEvent(): void {
    this.notifyService.notify('Button was clicked!');
  }
}
