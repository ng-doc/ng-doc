import {ChangeDetectionStrategy, Component} from '@angular/core';
import {preventInitialChildAnimations} from '@ng-doc/ui-kit';

@Component({
	animations: [preventInitialChildAnimations],
	selector: 'ng-doc-app',
	templateUrl: './app.component.html',
	styleUrls: ['./app.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {}
