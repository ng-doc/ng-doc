import {ChangeDetectionStrategy, Component, Inject} from '@angular/core';
import {NG_DOC_CONTEXT, NgDocContext, NgDocThemeService} from '@ng-doc/app';

@Component({
	selector: 'ng-doc-app',
	templateUrl: './app.component.html',
	styleUrls: ['./app.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
	constructor(
		@Inject(NG_DOC_CONTEXT)
		private readonly ngDocContext: NgDocContext,
		private readonly themeService: NgDocThemeService,

	) {
		console.log('context', this.ngDocContext);
	}

	toggleTheme(): void {
		if (this.themeService.currentTheme) {
			this.themeService.set()
		} else {
			this.themeService.set('night');
		}
	}
}
