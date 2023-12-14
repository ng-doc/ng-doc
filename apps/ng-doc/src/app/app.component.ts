import { ChangeDetectionStrategy, Component, HostBinding, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import {
	NgDocNavbarComponent,
	NgDocSidebarComponent,
	NgDocThemeToggleComponent,
} from '@ng-doc/app';
import { NgDocRootComponent } from '@ng-doc/app/components/root';
import { isBrowser } from '@ng-doc/core';
import {
	NgDocButtonIconComponent,
	NgDocIconComponent,
	NgDocMediaQueryDirective,
	NgDocTooltipDirective,
} from '@ng-doc/ui-kit';
import { preventInitialChildAnimations } from '@ng-doc/ui-kit/animations';
import { WINDOW } from '@ng-web-apis/common';

@Component({
	animations: [preventInitialChildAnimations],
	selector: 'ng-doc-app',
	templateUrl: './app.component.html',
	styleUrls: ['./app.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
	imports: [
		NgDocRootComponent,
		NgDocNavbarComponent,
		RouterLink,
		NgDocMediaQueryDirective,
		NgDocThemeToggleComponent,
		NgDocButtonIconComponent,
		NgDocTooltipDirective,
		NgDocIconComponent,
		NgDocSidebarComponent,
		RouterOutlet,
	],
})
export class AppComponent {
	protected readonly window: Window = inject(WINDOW);

	@HostBinding('attr.data-ng-doc-is-landing')
	get isLandingPage(): boolean {
		return isBrowser ? new URL(this.window.location.href).pathname === '/' : false;
	}
}
