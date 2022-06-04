import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {NgDocHeaderLevel} from '@ng-doc/app/types';

@Component({
	selector: 'ng-doc-title',
	templateUrl: './title.component.html',
	styleUrls: ['./title.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocTitleComponent {
	@Input()
	text: string = '';

	@Input()
	level: NgDocHeaderLevel = 1;

	get anchor(): string {
		return this.text.toLowerCase().replace(/\s/g, '-');
	}
}
