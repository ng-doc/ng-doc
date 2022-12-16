import {animate, style, transition, trigger} from '@angular/animations';
import {ChangeDetectionStrategy, Component} from '@angular/core';
import {NG_DOC_NIGHT_THEME} from '@ng-doc/app/constants';
import {NgDocTheme} from '@ng-doc/app/interfaces';
import {NgDocThemeService} from '@ng-doc/app/services';

@Component({
	animations: [
		trigger('switchIcon', [
			transition(
				':enter',
				[
					style({transform: 'translateY({{from}})', position: 'absolute', opacity: 0}),
					animate(
						'225ms cubic-bezier(0.4,0.0,0.2,1)',
						style({transform: 'translateY(0%)', position: 'absolute', opacity: 1}),
					),
				],
				{params: {from: '-100%'}},
			),
			transition(
				':leave',
				[
					style({transform: 'translateY(0%)', position: 'absolute', opacity: 1}),
					animate(
						'225ms cubic-bezier(0.4,0.0,0.2,1)',
						style({transform: 'translateY({{to}})', position: 'absolute', opacity: 0}),
					),
				],
				{params: {to: '-100%'}},
			),
		]),
	],
	selector: 'ng-doc-theme-toggle',
	templateUrl: './theme-toggle.component.html',
	styleUrls: ['./theme-toggle.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocThemeToggleComponent {
	protected readonly nightTheme: NgDocTheme = NG_DOC_NIGHT_THEME;

	constructor(protected readonly themeService: NgDocThemeService) {}

	toggleTheme(): void {
		this.themeService.set(this.themeService.currentTheme ? undefined : this.nightTheme.id);
	}
}
