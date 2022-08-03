import {ChangeDetectionStrategy, Component, HostBinding, Input} from '@angular/core';
import {NgDocBlockquoteType} from '@ng-doc/ui-kit/types';

@Component({
	selector: 'blockquote[ng-doc-blockquote]',
	templateUrl: './blockquote.component.html',
	styleUrls: ['./blockquote.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocBlockquoteComponent {
	@Input()
	@HostBinding('attr.data-ng-doc-type')
	type: NgDocBlockquoteType = 'default';
}
