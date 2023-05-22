import {ChangeDetectionStrategy, Component} from '@angular/core';

@Component({
  selector: 'ng-doc-develop-demo',
  templateUrl: './develop-demo.component.html',
  styleUrls: ['./develop-demo.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DevelopDemoComponent {}
