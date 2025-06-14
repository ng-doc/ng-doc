import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { NgDocPageBreadcrumbs } from '@ng-doc/app/interfaces';
import { NgDocIconComponent } from '@ng-doc/ui-kit';

@Component({
  selector: 'ng-doc-breadcrumb',
  templateUrl: './breadcrumb.component.html',
  styleUrls: ['./breadcrumb.component.scss'],
  imports: [NgDocIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocBreadcrumbComponent implements NgDocPageBreadcrumbs {
  @Input()
  breadcrumbs: string[] = [];
}
