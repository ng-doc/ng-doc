import {ChangeDetectionStrategy, Component, Input, OnChanges, SimpleChanges} from '@angular/core';
import {NgDocExportedProperty, NgDocExportedPropertySignature} from '@ng-doc/core';

@Component({
	selector: 'ng-doc-api-properties',
	templateUrl: './api-properties.component.html',
	styleUrls: ['./api-properties.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocApiPropertiesComponent implements OnChanges {
	@Input()
	properties: NgDocExportedProperty[] | NgDocExportedPropertySignature[] = [];

	@Input()
	signature: boolean = false;

	columns: string[] = [];

	ngOnChanges(): void {
		this.columns = ['tags', 'name', 'type', ...(this.signature ? [] : ['initializer']), 'description'];
	}
}
