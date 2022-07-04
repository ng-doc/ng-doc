import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {NgDocPlaygroundProperties} from '@ng-doc/builder';

@Component({
	selector: 'ng-doc-playground-properties',
	templateUrl: './playground-properties.component.html',
	styleUrls: ['./playground-properties.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocPlaygroundPropertiesComponent {
	@Input()
	properties?: NgDocPlaygroundProperties;
}
