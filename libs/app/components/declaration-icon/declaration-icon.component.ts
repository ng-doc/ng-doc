import {ChangeDetectionStrategy, Component, HostBinding, Input, OnInit} from '@angular/core';

@Component({
	selector: 'ng-doc-declaration-icon',
	template: '',
	styleUrls: ['./declaration-icon.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class NgDocDeclarationIconComponent {
	@Input()
	@HostBinding('attr.data-ng-doc-type')
	type: string = '';
}
