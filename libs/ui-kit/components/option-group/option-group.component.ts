import {NgIf} from '@angular/common';
import {
	AfterContentInit,
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	ContentChildren,
	Directive,
	QueryList,
} from '@angular/core';
import {NgDocOptionComponent} from '@ng-doc/ui-kit/components/option';
import {NgDocTextComponent} from '@ng-doc/ui-kit/components/text';
import {UntilDestroy, untilDestroyed} from '@ngneat/until-destroy';
import {startWith} from 'rxjs/operators';

@Directive({
	selector: '[ngDocOptionGroupHeader]',
	standalone: true,
})
export class NgDocOptionGroupHeaderDirective {}

@Component({
	selector: 'ng-doc-option-group',
	templateUrl: './option-group.component.html',
	styleUrls: ['./option-group.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
	imports: [NgIf, NgDocTextComponent],
})
@UntilDestroy()
export class NgDocOptionGroupComponent<T> implements AfterContentInit {
	@ContentChildren(NgDocOptionComponent, {descendants: true})
	options: QueryList<NgDocOptionComponent<T>> = new QueryList<NgDocOptionComponent<T>>();
	hasHeader: boolean = false;

	constructor(private changeDetectorRef: ChangeDetectorRef) {}

	ngAfterContentInit(): void {
		this.options.changes
			.pipe(startWith(this.options), untilDestroyed(this))
			.subscribe((options: QueryList<NgDocOptionComponent<T>>) => {
				this.hasHeader = !!options.length;
				this.changeDetectorRef.markForCheck();
			});
	}
}
