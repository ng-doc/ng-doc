import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {NgDocExportedDeclaration} from '@ng-doc/core';

@Component({
	selector: 'ng-doc-api-tags',
	templateUrl: './api-tags.component.html',
	styleUrls: ['./api-tags.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocApiTagsComponent {
	@Input()
	api?: NgDocExportedDeclaration;
}
