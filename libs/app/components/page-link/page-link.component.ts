import {NgIf, NgTemplateOutlet} from '@angular/common';
import {ChangeDetectionStrategy, Component, ElementRef, Input, OnInit} from '@angular/core';
import {RouterLink} from '@angular/router';
import {NgDocIconComponent} from '@ng-doc/ui-kit';

@Component({
	selector: 'ng-doc-page-link',
	templateUrl: './page-link.component.html',
	styleUrls: ['./page-link.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
	imports: [NgIf, RouterLink, NgTemplateOutlet, NgDocIconComponent],
})
export class NgDocPageLinkComponent implements OnInit {
	@Input()
	href: string = '';

	@Input()
	classes: string = '';

	protected isInCode: boolean = false;

	constructor(private elementRef: ElementRef<HTMLElement>) {}

	ngOnInit(): void {
		this.isInCode = this.elementRef.nativeElement.closest('code') !== null;
	}

	get isExternalLink(): boolean {
		return this.href.startsWith('http');
	}

	get path(): string {
		return !this.isExternalLink ? this.href.split('#')[0] : this.href;
	}

	get fragment(): string {
		return this.href.split('#')[1];
	}
}
