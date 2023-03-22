import {ChangeDetectionStrategy, Component, HostBinding} from '@angular/core';
import {preventInitialChildAnimations} from '@ng-doc/ui-kit/animations';

@Component({
	animations: [preventInitialChildAnimations],
	selector: 'ng-doc-app',
	templateUrl: './app.component.html',
	styleUrls: ['./app.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
	@HostBinding('attr.data-ng-doc-is-landing')
	get isLandingPage(): boolean {
		return new URL(window.location.href).pathname === '/';
	}
}
