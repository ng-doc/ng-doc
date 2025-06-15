import { Location } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  HostBinding,
  inject,
  Input,
} from '@angular/core';
import { NgDocRouteActiveDirective } from '@ng-doc/app/directives/route-active';
import { NgDocNavigation } from '@ng-doc/app/interfaces';
import {
  NgDocContent,
  NgDocDotComponent,
  NgDocExpanderComponent,
  NgDocIconComponent,
  NgDocRotatorDirective,
  NgDocTextComponent,
  NgDocTextLeftDirective,
} from '@ng-doc/ui-kit';
import { PolymorpheusModule } from '@tinkoff/ng-polymorpheus';

@Component({
  selector: 'ng-doc-sidebar-category',
  templateUrl: './sidebar-category.component.html',
  styleUrls: ['./sidebar-category.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgDocRouteActiveDirective,
    NgDocDotComponent,
    NgDocTextComponent,
    NgDocIconComponent,
    NgDocTextLeftDirective,
    NgDocRotatorDirective,
    NgDocExpanderComponent,
    PolymorpheusModule,
  ],
})
export class NgDocSidebarCategoryComponent {
  @Input({ required: true })
  category!: NgDocNavigation;

  @Input()
  @HostBinding('attr.data-ng-doc-is-root')
  isRoot: boolean = false;

  @Input()
  content: NgDocContent = '';

  @Input()
  @HostBinding('attr.data-ng-doc-expandable')
  expandable: boolean = true;

  @Input()
  expanded: boolean = true;

  protected readonly location = inject(Location);
  protected readonly changeDetectorRef = inject(ChangeDetectorRef);

  constructor() {
    this.location.onUrlChange(() => {
      if (this.location.path().includes(this.category.route ?? '', 0)) {
        this.expand();
      }
    });
  }

  toggle(): void {
    this.expanded ? this.collapse() : this.expand();
  }

  expand(): void {
    if (this.category?.expandable) {
      this.expanded = true;
      this.changeDetectorRef.markForCheck();
    }
  }

  collapse(): void {
    if (this.category?.expandable) {
      this.expanded = false;
      this.changeDetectorRef.markForCheck();
    }
  }
}
