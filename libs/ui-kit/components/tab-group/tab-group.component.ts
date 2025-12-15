import {
  AfterContentInit,
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ContentChildren,
  DestroyRef,
  ElementRef,
  inject,
  Input,
  QueryList,
  ViewChildren,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  NgDocSelectionComponent,
  NgDocSelectionHostDirective,
  NgDocSelectionOriginDirective,
} from '@ng-doc/ui-kit/components/selection';
import { PolymorpheusModule } from '@tinkoff/ng-polymorpheus';
import { startWith } from 'rxjs/operators';

import { NgDocTabComponent } from './tab/tab.component';

@Component({
  selector: 'ng-doc-tab-group',
  templateUrl: './tab-group.component.html',
  styleUrls: ['./tab-group.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgDocSelectionHostDirective,
    NgDocSelectionComponent,
    NgDocSelectionOriginDirective,
    PolymorpheusModule,
  ],
})
export class NgDocTabGroupComponent<T = number> implements AfterContentInit, AfterViewInit {
  private readonly changeDetectorRef = inject(ChangeDetectorRef);

  @Input()
  openedTab!: T;

  @ViewChildren('headerTab')
  tabElements: QueryList<ElementRef> = new QueryList<ElementRef>();

  @ContentChildren(NgDocTabComponent)
  tabs: QueryList<NgDocTabComponent<T>> = new QueryList<NgDocTabComponent<T>>();

  selectedTab?: NgDocTabComponent<T>;

  private readonly destroyRef = inject(DestroyRef);

  constructor() {}

  ngAfterContentInit(): void {
    this.tabs.changes
      .pipe(startWith(this.tabs), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        const tabToOpen: NgDocTabComponent<T> | undefined = this.openedTab
          ? this.tabs.find((tab: NgDocTabComponent<T>) => tab.id === this.openedTab)
          : this.tabs.get(0);

        tabToOpen && this.selectTab(tabToOpen);

        this.changeDetectorRef.markForCheck();
      });
  }

  ngAfterViewInit(): void {
    this.tabElements.changes
      .pipe(startWith(this.tabElements), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.changeDetectorRef.detectChanges());
  }

  get selectedIndex(): number {
    return this.selectedTab ? this.tabs.toArray().indexOf(this.selectedTab) : -1;
  }

  get selectedHeaderTab(): ElementRef | null {
    return this.selectedTab ? this.tabElements.get(this.selectedIndex) ?? null : null;
  }

  selectTab(tab: NgDocTabComponent<T>) {
    this.selectedTab = tab;
  }
}
