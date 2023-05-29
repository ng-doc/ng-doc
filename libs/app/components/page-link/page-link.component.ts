import {NgIf, NgTemplateOutlet} from '@angular/common';
import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {RouterLink} from '@angular/router';

@Component({
	selector: 'ng-doc-page-link',
	templateUrl: './page-link.component.html',
	styleUrls: ['./page-link.component.css'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
	imports: [NgIf, RouterLink, NgTemplateOutlet],
})
export class NgDocPageLinkComponent {
	@Input()
	href: string = '';

	@Input()
	classes: string = '';

	get isExternalLink(): boolean {
		return this.href.startsWith('http');
	}

	get path(): string {
		return this.href.split('#')[0];
	}

	get fragment(): string {
		return this.href.split('#')[1];
	}
}
