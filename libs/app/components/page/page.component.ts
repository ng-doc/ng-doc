import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  inject,
  TemplateRef,
  ViewChild,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NgDocRootPage } from '@ng-doc/app/classes/root-page';
import { NgDocPageWrapperComponent } from '@ng-doc/app/components/page-wrapper';
import { createComponent, generateToc } from '@ng-doc/app/helpers';
import { NgDocPageSkeleton } from '@ng-doc/app/interfaces';
import { NgDocSanitizeHtmlPipe } from '@ng-doc/app/pipes';
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
  NgDocTooltipDirective,
} from '@ng-doc/ui-kit';

@Component({
  selector: 'ng-doc-page',
  templateUrl: './page.component.html',
  styleUrls: ['./page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgDocButtonIconComponent,
    NgDocTooltipDirective,
    NgDocIconComponent,
    NgDocPageProcessorComponent,
    RouterOutlet,
    DialogOutletComponent,
    NgDocSanitizeHtmlPipe,
  ],
  providers: [
    provideTypeControl('NgDocTypeAlias', NgDocTypeAliasControlComponent, { order: 10 }),
    provideTypeControl('string', NgDocStringControlComponent, { order: 20 }),
    provideTypeControl('number', NgDocNumberControlComponent, { order: 30 }),
    provideTypeControl('boolean', NgDocBooleanControlComponent, { hideLabel: true, order: 40 }),
  ],
  host: { ngSkipHydration: 'true' },
})
export class NgDocPageComponent {
  @ViewChild('pageContainer', { read: ElementRef, static: true })
  pageContainer!: ElementRef<HTMLElement>;

  @ViewChild('childOutlet')
  childOutlet?: TemplateRef<never>;

  protected rootPage: NgDocRootPage = inject(NgDocRootPage);
  protected skeleton: NgDocPageSkeleton = inject(NG_DOC_PAGE_SKELETON);
  protected changeDetectorRef = inject(ChangeDetectorRef);

  protected pageWrapper: NgDocPageWrapperComponent = inject(NgDocPageWrapperComponent);

  createToc(): void {
    if (this.pageWrapper.pageToc && this.skeleton.toc) {
      createComponent(this.pageWrapper.pageToc, this.skeleton.toc, {
        tableOfContent: generateToc(this.pageContainer.nativeElement) ?? [],
      });

      this.changeDetectorRef.detectChanges();
    }
  }
}
