import {CommonModule} from '@angular/common';
import {ChangeDetectionStrategy, Component, Input} from '@angular/core';
import {NgDocTab} from '@ng-doc/app/interfaces';
import {NgDocSanitizeHtmlPipe} from '@ng-doc/app/pipes';
import {NgDocBindPipe, NgDocExecutePipe, NgDocTabComponent, NgDocTabGroupComponent} from '@ng-doc/ui-kit';

@Component({
	selector: 'ng-doc-tabs',
	standalone: true,
	imports: [
		CommonModule,
		NgDocTabGroupComponent,
		NgDocTabComponent,
		NgDocSanitizeHtmlPipe,
		NgDocExecutePipe,
		NgDocBindPipe,
	],
	templateUrl: './tabs.component.html',
	styleUrls: ['./tabs.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocTabsComponent {
	@Input()
	tabs: NgDocTab[] = [];

	getActiveIndex(tabs: NgDocTab[]): number {
		return Math.max(
			tabs.findIndex((tab: NgDocTab) => tab.active),
			0,
		);
	}

	appendElement(element: Element, parent: Element): void {
		parent.appendChild(element);
	}
}
