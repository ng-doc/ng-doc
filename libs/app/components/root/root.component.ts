import {ChangeDetectionStrategy, Component} from '@angular/core';

@Component({
	selector: 'ng-doc-root',
	templateUrl: './root.component.html',
	styleUrls: ['./root.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocRootComponent {}
