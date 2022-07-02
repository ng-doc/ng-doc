import {Component, Input} from '@angular/core';

@Component({
	selector: 'ng-doc-playground-demo',
	templateUrl: './playground-demo.component.html',
	styleUrls: ['./playground-demo.component.scss'],
})
export class NgDocPlaygroundDemoComponent {
	@Input()
	selector: string = '';
}
