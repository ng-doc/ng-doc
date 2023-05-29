import {NgIf, NgTemplateOutlet} from '@angular/common';
import {ChangeDetectionStrategy, Component, ContentChild, ElementRef, Input, TemplateRef} from '@angular/core';
import {NgDocComboboxHostComponent} from '@ng-doc/ui-kit/cdk/combobox-host';
import {NgDocListHost} from '@ng-doc/ui-kit/classes/list-host';
import {NgDocClearControlComponent} from '@ng-doc/ui-kit/components/clear-control';
import {NgDocDropdownComponent} from '@ng-doc/ui-kit/components/dropdown';
import {NgDocInputWrapperComponent} from '@ng-doc/ui-kit/components/input-wrapper';
import {NgDocDataDirective} from '@ng-doc/ui-kit/directives/data';
import {NgDocFocusCatcherDirective} from '@ng-doc/ui-kit/directives/focus-catcher';
import {NgDocInputStringDirective} from '@ng-doc/ui-kit/directives/input-string';
import {NgDocContextWithImplicit} from '@ng-doc/ui-kit/interfaces';
import {NgDocContent} from '@ng-doc/ui-kit/types';
import {PolymorpheusModule} from '@tinkoff/ng-polymorpheus';
import {FlControlHost, provideControlHost} from 'flex-controls';

@Component({
	selector: 'ng-doc-combobox',
	templateUrl: './combobox.component.html',
	styleUrls: ['./combobox.component.scss'],
	providers: [
		provideControlHost(NgDocComboboxComponent),
		{
			provide: NgDocListHost,
			useExisting: NgDocComboboxComponent,
		},
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
	imports: [
		NgDocComboboxHostComponent,
		NgDocInputWrapperComponent,
		NgDocFocusCatcherDirective,
		NgDocInputStringDirective,
		PolymorpheusModule,
		NgIf,
		NgDocClearControlComponent,
		NgDocDropdownComponent,
		NgTemplateOutlet,
	],
})
export class NgDocComboboxComponent<T> extends FlControlHost<T> implements NgDocListHost {
	@Input()
	readonly: boolean = false;

	@Input()
	placeholder: string = 'Chose the value';

	@Input()
	clearButton: boolean = true;

	@Input()
	rightContent: NgDocContent = '';

	@Input()
	valueContent: NgDocContent<NgDocContextWithImplicit<T | null>> = '';

	@ContentChild(NgDocDataDirective, {read: TemplateRef})
	data: TemplateRef<never> | null = null;

	constructor(private readonly elementRef: ElementRef<HTMLElement>) {
		super();
	}

	get listHostOrigin(): HTMLElement {
		return this.elementRef.nativeElement;
	}
}
