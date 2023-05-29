import {KeyValuePipe, NgFor, NgIf} from '@angular/common';
import {ChangeDetectionStrategy, Component, Input, OnChanges, SimpleChanges} from '@angular/core';
import {RouterLink} from '@angular/router';
import {NgDocKindIconComponent} from '@ng-doc/app/components/kind-icon';
import {NgDocPageInfo} from '@ng-doc/core/interfaces';
import {NgDocTextComponent, NgDocTooltipDirective} from '@ng-doc/ui-kit';

@Component({
	selector: 'ng-doc-search-result',
	templateUrl: './search-result.component.html',
	styleUrls: ['./search-result.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
	imports: [NgIf, NgFor, NgDocTextComponent, RouterLink, NgDocKindIconComponent, NgDocTooltipDirective, KeyValuePipe],
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
