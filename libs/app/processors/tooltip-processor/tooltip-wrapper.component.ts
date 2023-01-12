import {
	AfterViewInit,
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	ElementRef,
	Input,
	ViewChild,
} from '@angular/core';

@Component({
	selector: 'ng-doc-tooltip-wrapper',
	template: `
		<div
			class="content-projection"
			[ngDocTooltip]="content"
			[displayOrigin]="tooltipElement ?? contentProjection"
			[pointerOrigin]="tooltipElement ?? contentProjection"
			#contentProjection
		>
			<ng-content></ng-content>
		</div>
	`,
	styles: [
		`
			.content-projection {
				display: unset;
			}
		`,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocTooltipWrapperComponent implements AfterViewInit {
	@Input()
	content?: string;

	protected tooltipElement: HTMLElement | null = null;

	@ViewChild('contentProjection', {read: ElementRef, static: true})
	private contentProjection?: ElementRef<HTMLElement>;

	constructor(private readonly changeDetectorRef: ChangeDetectorRef) {}

	ngAfterViewInit(): void {
		if (this.contentProjection) {
			const element: Element | null = this.contentProjection.nativeElement.querySelector('[ngDocTooltip]');

			this.tooltipElement = element instanceof HTMLElement ? element : null;

			this.changeDetectorRef.detectChanges();
		}
	}
}
