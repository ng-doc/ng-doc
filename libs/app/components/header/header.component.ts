import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {NgDocHeaderLevel} from '@ng-doc/app/types';

@Component({
	selector: 'ng-doc-header',
	templateUrl: './header.component.html',
	styleUrls: ['./header.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocHeaderComponent {
	@Input()
	text: string = '';

	@Input()
	level: NgDocHeaderLevel = 1;

	get anchor(): string {
		return this.text.toLowerCase().replace(/\s/g, '-');
	}
}
