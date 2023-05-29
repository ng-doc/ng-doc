import {CommonModule} from '@angular/common';
import {ChangeDetectionStrategy, Component, HostBinding, Input} from '@angular/core';
import {NgDocContent, NgDocOrientation} from '@ng-doc/ui-kit';
import {PolymorpheusModule} from '@tinkoff/ng-polymorpheus';

@Component({
	selector: 'ng-doc-tile',
	standalone: true,
	imports: [CommonModule, PolymorpheusModule],
	template: `
		<div class="ng-doc-tile-media" *ngIf="media">
			<ng-container *polymorpheusOutlet="media">{{ media }}</ng-container>
		</div>
		<div class="ng-doc-tile-content">
			<h3 ng-doc-text>
				<ng-container *polymorpheusOutlet="title">{{ title }}</ng-container>
			</h3>
			<div class="ng-doc-tile-description" ng-doc-text>
				<ng-content></ng-content>
			</div>
		</div>
	`,
	styleUrls: ['./tile.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TileComponent {
	@Input()
	title: NgDocContent = '';

	@Input()
	@HostBinding('attr.data-ng-doc-has-media')
	media?: NgDocContent;

	@Input()
	@HostBinding('attr.data-ng-doc-orientation')
	orientation: NgDocOrientation = 'horizontal';
}
