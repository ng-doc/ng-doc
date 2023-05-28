import {ChangeDetectionStrategy, Component} from '@angular/core';
import {NgDocButtonModule} from '@ng-doc/ui-kit';
import {NgDocNotifyService} from '@ng-doc/ui-kit/services/notify';

@Component({
  selector: 'ng-doc-button-demo',
  standalone: true,
  imports: [NgDocButtonModule],
  templateUrl: './button-demo.component.html',
  styleUrls: ['./button-demo.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ButtonDemoComponent {
  constructor(private readonly notifyService: NgDocNotifyService) {}

  clickEvent(): void {
    this.notifyService.notify('Button was clicked!');
  }
}
