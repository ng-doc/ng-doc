import { NgComponentOutlet, NgIf } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  TemplateRef,
  ViewChild,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NgDocRootPage } from '@ng-doc/app/classes/root-page';
import { NgDocBreadcrumbComponent } from '@ng-doc/app/components/breadcrumb';
import { NgDocPageWrapperComponent } from '@ng-doc/app/components/page-wrapper';
import { NgDocTocComponent } from '@ng-doc/app/components/toc';
import { createComponent, generateToc } from '@ng-doc/app/helpers';
import { NgDocPageSkeleton } from '@ng-doc/app/interfaces';
import { NgDocPageProcessorComponent } from '@ng-doc/app/processors';
import { provideTypeControl } from '@ng-doc/app/providers/type-control';
import { NG_DOC_PAGE_SKELETON } from '@ng-doc/app/tokens';
import {
  NgDocBooleanControlComponent,
  NgDocNumberControlComponent,
  NgDocStringControlComponent,
  NgDocTypeAliasControlComponent,
} from '@ng-doc/app/type-controls';
import {
  DialogOutletComponent,
  NgDocButtonIconComponent,
  NgDocIconComponent,
  NgDocMediaQueryDirective,
  NgDocTextComponent,
  NgDocTextLeftDirective,
  NgDocTextRightDirective,
  NgDocTooltipDirective,
} from '@ng-doc/ui-kit';
import { UntilDestroy } from '@ngneat/until-destroy';

@Component({
  selector: 'ng-doc-page',
  templateUrl: './page.component.html',
  styleUrls: ['./page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [
    NgIf,
    NgDocBreadcrumbComponent,
    NgDocButtonIconComponent,
    NgDocTooltipDirective,
    NgDocIconComponent,
    NgDocTextComponent,
    NgDocTextLeftDirective,
    NgDocTextRightDirective,
    NgDocMediaQueryDirective,
    NgDocTocComponent,
    NgDocPageProcessorComponent,
    NgComponentOutlet,
    RouterOutlet,
    DialogOutletComponent,
  ],
  providers: [
    provideTypeControl('NgDocTypeAlias', NgDocTypeAliasControlComponent, { order: 10 }),
    provideTypeControl('string', NgDocStringControlComponent, { order: 20 }),
    provideTypeControl('number', NgDocNumberControlComponent, { order: 30 }),
    provideTypeControl('boolean', NgDocBooleanControlComponent, { hideLabel: true, order: 40 }),
  ],
  host: { ngSkipHydration: 'true' },
})
@UntilDestroy()
export class NgDocPageComponent {
  @ViewChild('pageContainer', { read: ElementRef, static: true })
  pageContainer!: ElementRef<HTMLElement>;

  @ViewChild('childOutlet')
  childOutlet?: TemplateRef<never>;

  protected rootPage: NgDocRootPage = inject(NgDocRootPage);
  protected skeleton: NgDocPageSkeleton = inject(NG_DOC_PAGE_SKELETON);

  protected pageWrapper: NgDocPageWrapperComponent = inject(NgDocPageWrapperComponent);

  createToc(): void {
    if (this.pageWrapper.pageToc && this.skeleton.toc) {
      createComponent(this.pageWrapper.pageToc, this.skeleton.toc, {
        tableOfContent: generateToc(this.pageContainer.nativeElement) ?? [],
      });
    }
  }
}
