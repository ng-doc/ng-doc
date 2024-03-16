import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  Input,
  OnInit,
  ViewChild,
  ViewContainerRef,
} from '@angular/core';
import {
  ActivatedRoute,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
  Routes,
} from '@angular/router';
import { createComponent } from '@ng-doc/app/helpers';
import { NgDocPageSkeleton } from '@ng-doc/app/interfaces';
import { NgDocPageProcessorDirective } from '@ng-doc/app/processors';
import { NG_DOC_PAGE_SKELETON } from '@ng-doc/app/tokens';
import { isPresent } from '@ng-doc/core';
import { NgDocTabRouteComponent, NgDocTabRoutesGroupComponent } from '@ng-doc/ui-kit';

@Component({
  selector: 'ng-doc-page-wrapper',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    NgDocTabRouteComponent,
    NgDocTabRoutesGroupComponent,
    RouterLinkActive,
    NgDocPageProcessorDirective,
  ],
  templateUrl: './page-wrapper.component.html',
  styleUrl: './page-wrapper.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { ngSkipHydration: 'true' },
})
export class NgDocPageWrapperComponent implements OnInit {
  @Input({ required: true })
  routes!: Routes;

  @Input({ required: true })
  headerContent!: string;

  @ViewChild('pageBreadcrumbs', { read: ViewContainerRef, static: true })
  pageBreadcrumbs!: ViewContainerRef;

  @ViewChild('pageToc', { read: ViewContainerRef, static: true })
  pageToc?: ViewContainerRef;

  protected skeleton: NgDocPageSkeleton = inject(NG_DOC_PAGE_SKELETON);

  private breadcrumbs: string[] = inject(ActivatedRoute)
    .pathFromRoot.filter((route: ActivatedRoute) => !route.snapshot.url.length)
    .map((route: ActivatedRoute) => route.snapshot.title)
    .filter(isPresent);

  ngOnInit(): void {
    if (this.skeleton.breadcrumbs) {
      createComponent(this.pageBreadcrumbs, this.skeleton.breadcrumbs, {
        breadcrumbs: this.breadcrumbs,
      });
    }
  }
}
