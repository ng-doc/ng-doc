import {ChangeDetectionStrategy, Component, HostBinding, Input} from '@angular/core';

@Component({
	selector: 'ng-doc-declaration-tag',
	templateUrl: './declaration-tag.component.html',
	styleUrls: ['./declaration-tag.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class NgDocDeclarationTagComponent {
	@Input()
	@HostBinding('attr.data-ng-doc-kind')
	kind: string = '';
}
