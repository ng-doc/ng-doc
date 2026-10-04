import { ChangeDetectionStrategy, Component, computed, input, OnInit, Signal } from '@angular/core';
import { NgDocTab } from '@ng-doc/app/interfaces';
import {
  NgDocExecutePipe,
  NgDocIconComponent,
  NgDocTabComponent,
  NgDocTabGroupComponent,
} from '@ng-doc/ui-kit';

/**
 * Tabs of a page: grouped code blocks, or any content that Markdown wraps in
 * `<ng-doc-tab group="…" name="…">` elements.
 */
@Component({
  selector: 'ng-doc-tabs',
  imports: [NgDocTabGroupComponent, NgDocTabComponent, NgDocExecutePipe, NgDocIconComponent],
  templateUrl: './tabs.component.html',
  styleUrls: ['./tabs.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocTabsComponent implements OnInit {
  /** The tabs; their content is moved into the open panel. */
  readonly tabs = input<NgDocTab[]>([]);

  /** Index of the tab that opens first: the one marked active, or the first. */
  protected readonly activeIndex: Signal<number> = computed(() =>
    Math.max(
      this.tabs().findIndex((tab: NgDocTab) => tab.active),
      0,
    ),
  );

  ngOnInit(): void {
    // The tabs processor leaves the contents on the page until every processor has run on them;
    // only the open tab's content is shown, in the panel.
    this.tabs().forEach((tab: NgDocTab) => tab.content.remove());
  }

  /**
   * Moves a tab's content into its panel.
   * @param element - Content of the tab.
   * @param parent - The panel element.
   */
  appendElement(element: Element, parent: Element): void {
    parent.appendChild(element);
  }
}
