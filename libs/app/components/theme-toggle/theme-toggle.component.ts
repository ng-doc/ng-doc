import { animate, style, transition, trigger } from '@angular/animations';
import { NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NG_DOC_NIGHT_THEME } from '@ng-doc/app/constants';
import { NgDocTheme } from '@ng-doc/app/interfaces';
import { NgDocThemeService } from '@ng-doc/app/services';
import {
	NgDocButtonIconComponent,
	NgDocIconComponent,
	NgDocTooltipDirective,
} from '@ng-doc/ui-kit';

@Component({
	animations: [
		trigger('switchIcon', [
			transition(
				':enter',
				[
					style({ transform: 'translateX({{from}})', position: 'absolute', opacity: 0 }),
					animate(
						'225ms cubic-bezier(0.4,0.0,0.2,1)',
						style({ transform: 'translateX(0%)', position: 'absolute', opacity: 1 }),
					),
				],
				{ params: { from: '-100%' } },
			),
			transition(
				':leave',
				[
					style({ transform: 'translateX(0%)', position: 'absolute', opacity: 1 }),
					animate(
						'225ms cubic-bezier(0.4,0.0,0.2,1)',
						style({ transform: 'translateX({{to}})', position: 'absolute', opacity: 0 }),
					),
				],
				{ params: { to: '-100%' } },
			),
		]),
	],
	selector: 'ng-doc-theme-toggle',
	templateUrl: './theme-toggle.component.html',
	styleUrls: ['./theme-toggle.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
	imports: [NgDocButtonIconComponent, NgDocTooltipDirective, NgIf, NgDocIconComponent],
})
export class NgDocThemeToggleComponent {
	protected readonly themes: Array<NgDocTheme | undefined> = [NG_DOC_NIGHT_THEME, undefined];

	constructor(protected readonly themeService: NgDocThemeService) {}

	get nextTheme(): NgDocTheme | undefined {
		return this.themes[
			(this.themes.indexOf(this.themeService.currentTheme) + 1) % this.themes.length
		];
	}

	toggleTheme(): void {
		this.themeService.set(this.nextTheme?.id);
	}
}
