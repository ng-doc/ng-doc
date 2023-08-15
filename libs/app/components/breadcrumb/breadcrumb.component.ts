import {NgFor} from '@angular/common';
import {ChangeDetectionStrategy, Component} from '@angular/core';
import {ActivatedRoute, RouterLink} from '@angular/router';
import {NgDocRootPage} from '@ng-doc/app/classes';
import {isPresent} from '@ng-doc/core/helpers/is-present';
import {NgDocButtonIconComponent, NgDocIconComponent, NgDocTextComponent} from '@ng-doc/ui-kit';

@Component({
	selector: 'ng-doc-breadcrumb',
	templateUrl: './breadcrumb.component.html',
	styleUrls: ['./breadcrumb.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
	imports: [NgDocButtonIconComponent, RouterLink, NgDocIconComponent, NgFor, NgDocTextComponent],
})
export class NgDocBreadcrumbComponent {
	breadcrumbs: string[] = [];
	home: string;

	constructor(private readonly rootPage: NgDocRootPage, private readonly route: ActivatedRoute) {
		this.home = this.rootPage.routePrefix || '/';
		this.breadcrumbs = this.route.pathFromRoot
			.filter((route: ActivatedRoute) => !route.snapshot.url.length)
			.map((route: ActivatedRoute) => route.snapshot.title)
			.filter(isPresent);
	}
}
