import {
	AfterViewChecked,
	ChangeDetectionStrategy,
	Component,
	ElementRef,
	HostBinding,
	Input,
	NgZone,
	Renderer2,
} from '@angular/core';
import { ngDocMakePure } from '@ng-doc/ui-kit/decorators';
import { toElement } from '@ng-doc/ui-kit/helpers';
import { BaseElement, NgDocHorizontalAlign } from '@ng-doc/ui-kit/types';

@Component({
	selector: '[ng-doc-floated-content]',
	template: ` <ng-content></ng-content> `,
	styleUrls: ['./floated-content.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
})
export class NgDocFloatedContentComponent implements AfterViewChecked {
	@Input()
	bindTo?: BaseElement<HTMLElement>;

	@Input()
	propertyName: string = '';

	@Input()
	@HostBinding('attr.data-ng-doc-align')
	alignTo: NgDocHorizontalAlign = 'left';

	constructor(
		private elementRef: ElementRef<HTMLElement>,
		private renderer: Renderer2,
		private ngZone: NgZone,
	) {}

	ngAfterViewChecked(): void {
		if (this.bindTo && this.alignTo) {
			this.ngZone.runOutsideAngular(() =>
				Promise.resolve().then(() => this.setPadding(this.elementRef.nativeElement.offsetWidth)),
			);
		}
	}

	@ngDocMakePure
	setPadding(padding: number): void {
		if (this.bindTo && this.propertyName) {
			this.renderer.setStyle(
				toElement(this.bindTo),
				this.propertyName,
				padding ? `${padding}px` : null,
				2,
			);
		}
	}
}
