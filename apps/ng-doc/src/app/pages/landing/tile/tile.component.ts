import { booleanAttribute, ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Hue of a landing tile's icon. */
export type TileHue = 'brand' | 'violet' | 'green' | 'amber' | 'neutral';

/**
 * A feature tile of the landing page: a link card with an icon on a tinted square, a heading (with
 * an optional decorative emoji), a description and a "read more" line.
 */
@Component({
  selector: 'ng-doc-tile',
  imports: [RouterLink],
  template: `
    <a class="ng-doc-tile" [routerLink]="route()">
      <span class="ng-doc-tile-icon" aria-hidden="true"
        ><ng-content select="[ngDocTileIcon]"
      /></span>
      <h3 class="ng-doc-tile-heading">
        {{ heading() }}
        @if (emoji()) {
          <!-- Decorative: kept out of the link's accessible name. -->
          <span class="ng-doc-tile-emoji" aria-hidden="true">{{ emoji() }}</span>
        }
      </h3>
      <p class="ng-doc-tile-description"><ng-content /></p>
      @if (more()) {
        <span class="ng-doc-tile-more">{{ more() }} →</span>
      }
    </a>
  `,
  styleUrls: ['./tile.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-hue]': 'hue()',
    '[attr.data-wide]': 'wide()',
  },
})
export class TileComponent {
  /** Route of the page the tile links to. */
  readonly route = input.required<string>();

  /** Heading of the tile. */
  readonly heading = input.required<string>();

  /** A decorative emoji shown after the heading and hidden from assistive technology. */
  readonly emoji = input<string>('');

  /** Hue of the icon. */
  readonly hue = input<TileHue>('brand');

  /** Text of the "read more" line, usually the title of the linked page. */
  readonly more = input<string>('');

  /** Whether the tile spans two columns. */
  readonly wide = input<boolean, unknown>(false, { transform: booleanAttribute });
}
