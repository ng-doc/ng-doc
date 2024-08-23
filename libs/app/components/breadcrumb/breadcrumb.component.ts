import { NgFor } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgDocPageBreadcrumbs } from '@ng-doc/app/interfaces';
import { NgDocButtonIconComponent, NgDocIconComponent } from '@ng-doc/ui-kit';

@Component({
  selector: 'ng-doc-breadcrumb',
  templateUrl: './breadcrumb.component.html',
  styleUrls: ['./breadcrumb.component.scss'],
  standalone: true,
  imports: [NgDocButtonIconComponent, RouterLink, NgDocIconComponent, NgFor],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocBreadcrumbComponent implements NgDocPageBreadcrumbs {
  @Input()
  breadcrumbs: string[] = [];
}
