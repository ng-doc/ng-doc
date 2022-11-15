import {ChangeDetectionStrategy, Component, Inject} from '@angular/core';
import {NG_DOC_CONTEXT, NG_DOC_KEYWORDS_DICTIONARY, NgDocContext, NgDocKeywordsDictionary} from '@ng-doc/app';

@Component({
	selector: 'ng-doc-app',
	templateUrl: './app.component.html',
	styleUrls: ['./app.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
	constructor(
		@Inject(NG_DOC_CONTEXT)
		private readonly ngDocContext: NgDocContext,
		@Inject(NG_DOC_KEYWORDS_DICTIONARY)
		private readonly ngDocKeywordsDictionary: NgDocKeywordsDictionary
	) {
		console.log('context', this.ngDocContext);
		console.log('keywords dictionary', this.ngDocKeywordsDictionary);
	}
}
