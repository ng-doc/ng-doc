import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgDocNavigation, NgDocNavigationTexts, NgDocPageNavigation } from '@ng-doc/app/interfaces';
import { NG_DOC_TEXTS } from '@ng-doc/app/tokens';

/**
 * Links to the previous and the next page, as two cards at the bottom of a guide.
 */
@Component({
  selector: 'ng-doc-page-navigation',
  imports: [RouterLink],
  templateUrl: './page-navigation.component.html',
  styleUrls: ['./page-navigation.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocPageNavigationComponent implements NgDocPageNavigation {
  protected readonly texts: NgDocNavigationTexts = inject(NG_DOC_TEXTS).navigation;

  /** The page before this one in the sidebar. */
  readonly prevPage = input<NgDocNavigation>();

  /** The page after this one in the sidebar. */
  readonly nextPage = input<NgDocNavigation>();
}
