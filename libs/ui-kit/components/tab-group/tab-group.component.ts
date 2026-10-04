import {
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChildren,
  ElementRef,
  input,
  linkedSignal,
  Signal,
  untracked,
  viewChildren,
} from '@angular/core';
import {
  NgDocSelectionComponent,
  NgDocSelectionHostDirective,
  NgDocSelectionOriginDirective,
} from '@ng-doc/ui-kit/components/selection';
import { PolymorpheusOutlet } from '@taiga-ui/polymorpheus';

import { NgDocTabComponent } from './tab/tab.component';

let nextId = 0;

/**
 * Tabs as a segmented control over one panel. It follows the WAI-ARIA tabs pattern: the arrow keys,
 * Home and End move between the tabs and select them. The highlight of the open tab slides to
 * the newly opened one.
 */
@Component({
  selector: 'ng-doc-tab-group',
  templateUrl: './tab-group.component.html',
  styleUrls: ['./tab-group.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PolymorpheusOutlet,
    NgDocSelectionComponent,
    NgDocSelectionHostDirective,
    NgDocSelectionOriginDirective,
  ],
})
export class NgDocTabGroupComponent<T = number> {
  /** Id of the tab to open; the first tab opens when it is not set or matches no tab. */
  readonly openedTab = input<T | undefined>(undefined);

  /** The tabs of the group. */
  readonly tabs: Signal<ReadonlyArray<NgDocTabComponent<T>>> =
    contentChildren<NgDocTabComponent<T>>(NgDocTabComponent);

  /** Header buttons of the tabs, in order. */
  readonly tabElements: Signal<ReadonlyArray<ElementRef<HTMLElement>>> =
    viewChildren<ElementRef<HTMLElement>>('headerTab');

  /**
   * The open tab. It follows `openedTab` and the tab list; a tab the user selects stays open as
   * long as it is in the group and `openedTab` does not change.
   */
  readonly selectedTab = linkedSignal<
    { tabs: ReadonlyArray<NgDocTabComponent<T>>; opened: T | undefined },
    NgDocTabComponent<T> | undefined
  >({
    source: () => ({ tabs: this.tabs(), opened: this.openedTab() }),
    computation: ({ tabs, opened }, previous) => {
      const kept: NgDocTabComponent<T> | undefined =
        previous?.value && previous.source.opened === opened && tabs.includes(previous.value)
          ? previous.value
          : undefined;

      return (
        kept ??
        (opened !== undefined && opened !== null
          ? tabs.find((tab: NgDocTabComponent<T>) => tab.id() === opened)
          : undefined) ??
        tabs[0]
      );
    },
  });

  /** Index of the open tab, or -1. */
  readonly selectedIndex: Signal<number> = computed(() => {
    const selected: NgDocTabComponent<T> | undefined = this.selectedTab();

    return selected ? this.tabs().indexOf(selected) : -1;
  });

  /** Prefix of the ids that tie the tabs to the panel. */
  protected readonly idPrefix: string = `ng-doc-tab-group-${nextId++}`;

  /**
   * Opens a tab.
   * @param tab - The tab to open.
   */
  selectTab(tab: NgDocTabComponent<T>): void {
    untracked(() => this.selectedTab.set(tab));
  }

  /**
   * Moves the selection with the keyboard and focuses the new tab.
   * @param event - The key press on a tab.
   */
  protected onKeydown(event: KeyboardEvent): void {
    const tabs: ReadonlyArray<NgDocTabComponent<T>> = this.tabs();
    const current: number = Math.max(this.selectedIndex(), 0);
    const next: number | undefined = {
      ArrowRight: (current + 1) % tabs.length,
      ArrowLeft: (current - 1 + tabs.length) % tabs.length,
      Home: 0,
      End: tabs.length - 1,
    }[event.key];

    if (next !== undefined && tabs[next]) {
      event.preventDefault();
      this.selectTab(tabs[next]);
      this.tabElements()[next]?.nativeElement.focus();
    }
  }
}
