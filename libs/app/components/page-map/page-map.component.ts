import {ChangeDetectionStrategy, Component, Input, OnChanges, OnInit} from '@angular/core';
import {generatePageMap} from '@ng-doc/app/helpers';
import {NgDocPageMapItem} from '@ng-doc/app/interfaces';

@Component({
	selector: 'ng-doc-page-map',
	templateUrl: './page-map.component.html',
	styleUrls: ['./page-map.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocPageMapComponent implements OnChanges {
	@Input()
	pageContainer?: HTMLElement;

	map: NgDocPageMapItem[] = [];

	constructor() {}

	ngOnChanges(): void {
		if (this.pageContainer) {
			this.map = generatePageMap(this.pageContainer);

			console.log('pageMap', this.map);
		}
	}
}
