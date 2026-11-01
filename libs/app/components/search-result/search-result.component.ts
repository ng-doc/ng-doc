import { KeyValuePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, Signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgDocKindIconComponent } from '@ng-doc/app/components/kind-icon';
import type { NgDocSearchTexts } from '@ng-doc/app/interfaces';
import { NG_DOC_TEXTS } from '@ng-doc/app/tokens';
import { NgDocPageInfo } from '@ng-doc/core/interfaces';
import { NgDocTextComponent, NgDocTooltipDirective } from '@ng-doc/ui-kit';

/**
 * A list of pages grouped by their type (guides and API).
 */
@Component({
  selector: 'ng-doc-search-result',
  templateUrl: './search-result.component.html',
  styleUrls: ['./search-result.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgDocTextComponent,
    RouterLink,
    NgDocKindIconComponent,
    NgDocTooltipDirective,
    KeyValuePipe,
  ],
})
export class NgDocSearchResultComponent {
  protected readonly texts: NgDocSearchTexts = inject(NG_DOC_TEXTS).search;

  /** The pages to list. */
  readonly result = input<NgDocPageInfo[] | null>([]);

  /** The pages grouped by their type. */
  readonly groupedResult: Signal<Record<string, NgDocPageInfo[]>> = computed(() =>
    (this.result() ?? []).reduce(
      (grouped: Record<string, NgDocPageInfo[]>, item: NgDocPageInfo) => {
        (grouped[item.type] ??= []).push(item);

        return grouped;
      },
      {},
    ),
  );

  /**
   * Returns the heading of a group.
   * @param type - The page type of the group.
   */
  typeToLabel(type: string): string {
    switch (type) {
      case 'api':
        return this.texts.resultApi;
      case 'guide':
        return this.texts.resultGuides;
      default:
        return this.texts.resultUnknown;
    }
  }
}
