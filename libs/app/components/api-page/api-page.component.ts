import {ChangeDetectionStrategy, Component} from '@angular/core';

@Component({
	selector: 'ng-doc-api-page',
	templateUrl: './api-page.component.html',
	styleUrls: ['./api-page.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ApiPageComponent {}
