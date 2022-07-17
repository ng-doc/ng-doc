import {ChangeDetectionStrategy, Component, Input} from '@angular/core';

@Component({
	selector: 'ng-doc-demo-displayer',
	templateUrl: './demo-displayer.component.html',
	styleUrls: ['./demo-displayer.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocDemoDisplayerComponent {
	@Input()
	code: string = '';

	@Input()
	language: string = 'typescript';

	@Input()
	container: boolean = true;

	expanded: boolean = false;
}
