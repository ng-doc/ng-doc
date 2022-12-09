import {ChangeDetectionStrategy, Component} from '@angular/core';
import {NgDocApiListComponent} from '@ng-doc/app';

@Component({
	selector: 'ng-doc-demo',
	templateUrl: './demo.component.html',
	styleUrls: ['./demo.component.css'],
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class DemoComponent {
	variable?: NgDocApiListComponent;
}
