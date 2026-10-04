import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgDocPageBreadcrumbs } from '@ng-doc/app/interfaces';

/**
 * The breadcrumbs of a page: a navigation landmark that lists the categories above the page and
 * marks the page itself as the current one.
 */
@Component({
  selector: 'ng-doc-breadcrumb',
  templateUrl: './breadcrumb.component.html',
  styleUrls: ['./breadcrumb.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocBreadcrumbComponent implements NgDocPageBreadcrumbs {
  /** Titles from the top category down to the page. */
  readonly breadcrumbs = input<string[]>([]);
}
