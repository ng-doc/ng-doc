import {ChangeDetectionStrategy, Component, Input, OnChanges, SimpleChanges} from '@angular/core';
import {NgDocPageInfo} from '@ng-doc/core/interfaces';

@Component({
	selector: 'ng-doc-search-result',
	templateUrl: './search-result.component.html',
	styleUrls: ['./search-result.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocSearchResultComponent implements OnChanges {
	@Input()
	result: NgDocPageInfo[] | null = [];

	groupedResult: Record<string, NgDocPageInfo[]> = {};

	ngOnChanges({result}: SimpleChanges): void {
		if (result && this.result) {
			this.groupedResult = this.result.reduce((grouped: Record<string, NgDocPageInfo[]>, item: NgDocPageInfo) => {
				if (!grouped[item.type]) {
					grouped[item.type] = [];
				}

				grouped[item.type].push(item);

				return grouped;
			}, {});
		}
	}

	typeToLabel(type: string): string {
		switch (type) {
			case 'api':
				return 'API';
			case 'guide':
				return 'Guides';
			default:
				return 'Unknown';
		}
	}
}
