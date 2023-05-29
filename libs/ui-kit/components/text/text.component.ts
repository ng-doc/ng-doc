import {NgIf} from '@angular/common';
import {
	AfterContentChecked,
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	ContentChild,
	HostBinding,
	Input,
} from '@angular/core';
import {NgDocSize, NgDocTextAlign, NgDocTextColor} from '@ng-doc/ui-kit/types';

import {NgDocTextLeftDirective} from './text-left.directive';
import {NgDocTextRightDirective} from './text-right.directive';

@Component({
	selector: '[ng-doc-text]',
	templateUrl: './text.component.html',
	styleUrls: ['./text.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
	imports: [NgIf],
})
export class NgDocTextComponent implements AfterContentChecked {
	/** Text size */
	@Input()
	@HostBinding('attr.data-ng-doc-text-size')
	size: NgDocSize = 'medium';

	/** Text color */
	@Input()
	@HostBinding('attr.data-ng-doc-text-color')
	color: NgDocTextColor = 'normal';

	/** Text align */
	@Input()
	@HostBinding('attr.data-ng-doc-text-align')
	align: NgDocTextAlign = 'left';

	@Input()
	@HostBinding('attr.data-ng-doc-text-absolute')
	absoluteContent: boolean = false;

	@ContentChild(NgDocTextLeftDirective)
	leftContent?: NgDocTextLeftDirective;

	@ContentChild(NgDocTextRightDirective)
	rightContent?: NgDocTextRightDirective;

	@HostBinding('class.ngde')
	readonly ngDocElement: boolean = true;

	constructor(private readonly changeDetectorRef: ChangeDetectorRef) {}

	ngAfterContentChecked(): void {
		this.changeDetectorRef.detectChanges();
	}
}
