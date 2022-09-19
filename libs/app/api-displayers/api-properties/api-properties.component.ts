import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {NgDocExportedProperty} from '@ng-doc/core';

@Component({
	selector: 'ng-doc-api-properties',
	templateUrl: './api-properties.component.html',
	styleUrls: ['./api-properties.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocApiPropertiesComponent {
	@Input()
	properties: NgDocExportedProperty[] = [];

	readonly columns: string[] = ['tags', 'name', 'type', 'initializer', 'description'];
}
