import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgDocSelectionOriginDirective } from '@ng-doc/ui-kit/components/selection';

/** A link of an `ng-doc-tab-routes-group`; the active one is underlined and marked current. */
@Component({
  selector: 'a[ng-doc-tab-route]',
  imports: [],
  templateUrl: './tab-route.component.html',
  styleUrl: './tab-route.component.scss',
  hostDirectives: [
    { directive: NgDocSelectionOriginDirective, inputs: ['ngDocSelectionOrigin: isActive'] },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.aria-current]': 'isActive() ? "page" : null',
  },
})
export class NgDocTabRouteComponent {
  /** Whether the link's route is active. */
  readonly isActive = input<boolean>(false);
}
