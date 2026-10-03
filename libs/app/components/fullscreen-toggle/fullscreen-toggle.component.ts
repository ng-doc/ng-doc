import { ChangeDetectionStrategy, Component, computed, input, Signal } from '@angular/core';
import {
  NgDocButtonIconComponent,
  NgDocFullscreenDirective,
  NgDocTooltipDirective,
} from '@ng-doc/ui-kit';

/**
 * An icon button that shows an element fullscreen with the browser Fullscreen API, or leaves
 * fullscreen. Its icon, label and tooltip follow the fullscreen state, and it is hidden where the
 * browser does not support fullscreen and on the server.
 * @example
 * ```html
 * <div ngDocFullscreen #stage="ngDocFullscreen">…</div>
 * <ng-doc-fullscreen-toggle [target]="stage" />
 * ```
 */
@Component({
  selector: 'ng-doc-fullscreen-toggle',
  imports: [NgDocButtonIconComponent, NgDocTooltipDirective],
  template: `
    @if (target().supported()) {
      <button
        type="button"
        ng-doc-button-icon
        [rounded]="false"
        [attr.aria-label]="label()"
        [ngDocTooltip]="label()"
        (click)="target().toggle()">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          @if (target().active()) {
            <path
              d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
          } @else {
            <path
              d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
          }
        </svg>
      </button>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
    }

    :host([hidden]) {
      display: none;
    }

    svg {
      width: 16px;
      height: 16px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[hidden]': '!target().supported()',
  },
})
export class NgDocFullscreenToggleComponent {
  /** The element to show fullscreen. */
  readonly target = input.required<NgDocFullscreenDirective>();

  /** Accessible name and tooltip of the button, which follow the fullscreen state. */
  protected readonly label: Signal<string> = computed(() =>
    this.target().active() ? 'Exit fullscreen' : 'Fullscreen',
  );
}
