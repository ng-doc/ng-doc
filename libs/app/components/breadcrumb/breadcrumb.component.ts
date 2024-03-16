import { NgFor } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgDocPageBreadcrumbs } from '@ng-doc/app/interfaces';
import { NG_DOC_ROUTE_PREFIX } from '@ng-doc/app/tokens';
import { NgDocButtonIconComponent, NgDocIconComponent, NgDocTextComponent } from '@ng-doc/ui-kit';

@Component({
  selector: 'ng-doc-breadcrumb',
  templateUrl: './breadcrumb.component.html',
  styleUrls: ['./breadcrumb.component.scss'],
  standalone: true,
  imports: [NgDocButtonIconComponent, RouterLink, NgDocIconComponent, NgFor, NgDocTextComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocBreadcrumbComponent implements NgDocPageBreadcrumbs {
  @Input()
  breadcrumbs: string[] = [];

  protected readonly home: string = inject(NG_DOC_ROUTE_PREFIX) || '/';
}
