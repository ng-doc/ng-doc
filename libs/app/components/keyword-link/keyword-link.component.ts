import {ChangeDetectionStrategy, Component, Inject, Input, OnInit} from '@angular/core';
import {NG_DOC_KEYWORDS_DICTIONARY} from '@ng-doc/app/tokens';
import {NgDocKeywordsDictionary} from '@ng-doc/app/types';
import {NgDocKeywordEntity} from '@ng-doc/builder';

@Component({
	selector: 'ng-doc-keyword-link',
	templateUrl: './keyword-link.component.html',
	styleUrls: ['./keyword-link.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class NgDocKeywordLinkComponent {
	@Input()
	keyword: string = '';

	constructor(
		@Inject(NG_DOC_KEYWORDS_DICTIONARY)
		private readonly keywordsDictionary: NgDocKeywordsDictionary
	) {}

	get keywordEntity(): NgDocKeywordEntity | undefined {
		return this.keywordsDictionary[this.keyword];
	}
}
