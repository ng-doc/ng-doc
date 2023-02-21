import {ChangeDetectionStrategy, Component} from '@angular/core';

@Component({
	selector: 'ng-doc-landing',
	templateUrl: './landing.component.html',
	styleUrls: ['./landing.component.css'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingComponent {}
