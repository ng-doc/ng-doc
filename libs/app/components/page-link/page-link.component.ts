import { NgIf, NgTemplateOutlet } from '@angular/common';
import {
	ChangeDetectionStrategy,
	Component,
	ElementRef,
	Input,
	OnChanges,
	OnInit,
} from '@angular/core';
import { Params, RouterLink } from '@angular/router';
import { NgDocIconComponent } from '@ng-doc/ui-kit';

@Component({
	selector: 'ng-doc-page-link',
	templateUrl: './page-link.component.html',
	styleUrls: ['./page-link.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
	imports: [NgIf, RouterLink, NgTemplateOutlet, NgDocIconComponent],
})
export class NgDocPageLinkComponent implements OnInit, OnChanges {
	@Input({ required: true })
	href: string = '';

	@Input()
	classes: string = '';

	protected isInCode: boolean = false;

	private link: HTMLAnchorElement | undefined;

	constructor(private elementRef: ElementRef<HTMLElement>) {}

	ngOnInit(): void {
		this.isInCode = this.elementRef.nativeElement.closest('code') !== null;
	}

	ngOnChanges(): void {
		this.link = document.createElement('a');
		this.link.href = this.href;
	}

	get isExternalLink(): boolean {
		return this.href.startsWith('http');
	}

	get path(): string {
		return (!this.isExternalLink ? this.link?.pathname : this.href) ?? '';
	}

	get fragment(): string | undefined {
		return this.link?.hash.replace(/^#/, '') || undefined;
	}

	get queryParams(): Params {
		return Object.fromEntries(
			new URLSearchParams(this.link?.search.replace(/^\?/, '') ?? '').entries(),
		);
	}
}
