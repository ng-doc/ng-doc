import { ChangeDetectionStrategy, Component, computed, input, Signal } from '@angular/core';
import { NgDocTab } from '@ng-doc/app/interfaces';
import {
  NgDocExecutePipe,
  NgDocIconComponent,
  NgDocTabComponent,
  NgDocTabGroupComponent,
} from '@ng-doc/ui-kit';

/** Grouped code blocks of a page, shown as tabs. */
@Component({
  selector: 'ng-doc-tabs',
  imports: [NgDocTabGroupComponent, NgDocTabComponent, NgDocExecutePipe, NgDocIconComponent],
  templateUrl: './tabs.component.html',
  styleUrls: ['./tabs.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocTabsComponent {
  /** The tabs; their content is moved into the open panel. */
  readonly tabs = input<NgDocTab[]>([]);

  /** Index of the tab that opens first: the one marked active, or the first. */
  protected readonly activeIndex: Signal<number> = computed(() =>
    Math.max(
      this.tabs().findIndex((tab: NgDocTab) => tab.active),
      0,
    ),
  );

  /**
   * Moves a tab's content into its panel.
   * @param element - Content of the tab.
   * @param parent - The panel element.
   */
  appendElement(element: Element, parent: Element): void {
    parent.appendChild(element);
  }
}
