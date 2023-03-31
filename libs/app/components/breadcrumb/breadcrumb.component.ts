import {ChangeDetectionStrategy, Component} from '@angular/core';
import {ActivatedRoute, Router, UrlSegment} from '@angular/router';
import {NgDocRootPage} from '@ng-doc/app/classes';
import {isPresent} from '@ng-doc/core/helpers/is-present';

@Component({
	selector: 'ng-doc-breadcrumb',
	templateUrl: './breadcrumb.component.html',
	styleUrls: ['./breadcrumb.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocBreadcrumbComponent {
	breadcrumbs: string[] = [];
	home: string = this.rootPage.routePrefix || '/';
	constructor(private readonly rootPage: NgDocRootPage, private readonly route: ActivatedRoute) {
		this.breadcrumbs =this.route.pathFromRoot
			.filter((route: ActivatedRoute) => !route.snapshot.url.length)
			.map((route: ActivatedRoute) => route.snapshot.title)
			.filter(isPresent);
	}
}
