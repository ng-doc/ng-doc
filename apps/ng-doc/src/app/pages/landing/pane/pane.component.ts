import { CommonModule } from '@angular/common';
import {ChangeDetectionStrategy, Component, HostBinding, Input} from '@angular/core';
import {NgDocContent, NgDocOrientation, NgDocTextModule} from '@ng-doc/ui-kit';
import {PolymorpheusModule} from '@tinkoff/ng-polymorpheus';

@Component({
	selector: 'ng-doc-pane',
	standalone: true,
	imports: [CommonModule, NgDocTextModule, PolymorpheusModule],
	template: `
		<div class="ng-doc-pane-wrapper">
			<h3 ng-doc-text>
				<ng-container *polymorpheusOutlet="title">{{ title }}</ng-container>
			</h3>
			<div class="ng-doc-pane-content" ng-doc-text>
				<ng-content></ng-content>
			</div>
		</div>
		<div class="ng-doc-pane-media" *ngIf="media">
			<ng-container *polymorpheusOutlet="media">{{ media }}</ng-container>
		</div>
	`,
	styleUrls: ['./pane.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaneComponent {
	@Input()
	title: NgDocContent = '';

	@Input()
	@HostBinding('attr.data-ng-doc-has-media')
	media?: NgDocContent;

	@Input()
	@HostBinding('attr.data-ng-doc-orientation')
	orientation: NgDocOrientation = 'horizontal';
}
