import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'ng-doc-viewport-demo',
  templateUrl: './viewport-demo.component.html',
  styleUrls: ['./viewport-demo.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewportDemoComponent {
  readonly title = input('A responsive card');
}
