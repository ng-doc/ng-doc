import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { NgDocNavigationTexts, NgDocPageBreadcrumbs } from '@ng-doc/app/interfaces';
import { NG_DOC_TEXTS } from '@ng-doc/app/tokens';

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
  protected readonly texts: NgDocNavigationTexts = inject(NG_DOC_TEXTS).navigation;

  /** Titles from the top category down to the page. */
  readonly breadcrumbs = input<string[]>([]);
}
