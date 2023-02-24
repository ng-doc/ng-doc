import {ChangeDetectionStrategy, Component, HostBinding} from '@angular/core';
import {Router} from '@angular/router';
import {preventInitialChildAnimations} from '@ng-doc/ui-kit';

@Component({
	animations: [preventInitialChildAnimations],
	selector: 'ng-doc-app',
	templateUrl: './app.component.html',
	styleUrls: ['./app.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
	constructor(private readonly router: Router) {}

	@HostBinding('attr.data-ng-doc-is-landing')
	get isLandingPage(): boolean {
		return this.router.url === '/';
	}
}
