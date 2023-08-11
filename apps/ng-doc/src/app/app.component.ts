import {ChangeDetectionStrategy, Component, HostBinding} from '@angular/core';
import {preventInitialChildAnimations} from '@ng-doc/ui-kit/animations';
import { NgDocMediaQueryDirective, NgDocButtonIconComponent, NgDocTooltipDirective, NgDocIconComponent } from '@ng-doc/ui-kit';
import { RouterLink, RouterOutlet } from '@angular/router';
import { NgDocNavbarComponent, NgDocThemeToggleComponent, NgDocSidebarComponent } from '@ng-doc/app';
import { NgDocRootComponent } from '@ng-doc/app/components/root';

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
	@HostBinding('attr.data-ng-doc-is-landing')
	get isLandingPage(): boolean {
		return new URL(window.location.href).pathname === '/';
	}
}
