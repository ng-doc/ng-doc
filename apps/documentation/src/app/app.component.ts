import {Component, Inject} from '@angular/core';
import {NG_DOC_CONTEXT, NgDocContext} from '@ng-doc/app';

@Component({
	selector: 'ng-doc-app',
	templateUrl: './app.component.html',
	styleUrls: ['./app.component.scss'],
})
export class AppComponent {
	title = 'documentation';

	constructor(
		@Inject(NG_DOC_CONTEXT)
		private readonly ngDocContext: NgDocContext,
	) {
		console.log('context', this.ngDocContext);
	}
}
