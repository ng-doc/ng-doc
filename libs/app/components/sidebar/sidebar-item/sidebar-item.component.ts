import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NgDocNavigation } from '@ng-doc/app/interfaces';
import { NgDocColor } from '@ng-doc/ui-kit';

/** A status badge of a sidebar item, from the page's JSDoc status tag. */
export interface NgDocSidebarItemStatus {
  /** Colour of the badge. */
  type: NgDocColor;
  /** Text of the badge, in sentence case. */
  text: string;
}

/**
 * A page link in the sidebar, with the status badges of the page.
 */
@Component({
  selector: 'ng-doc-sidebar-item',
  templateUrl: './sidebar-item.component.html',
  styleUrls: ['./sidebar-item.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLinkActive, RouterLink],
  host: {
    '[attr.data-ng-doc-is-root]': 'isRoot()',
  },
})
export class NgDocSidebarItemComponent {
  /** The page. */
  readonly item = input.required<NgDocNavigation>();

  /** Whether the page sits at the top level of the sidebar, beside the categories. */
  readonly isRoot = input<boolean, unknown>(false, { transform: booleanAttribute });

  /**
   * The badges of the page: one per JSDoc status tag, in the tag's colour (green without one)
   * and with its text in sentence case.
   */
  readonly statuses = computed<NgDocSidebarItemStatus[]>(() => {
    const statuses: string[] = this.item().metadata?.tags['status'] ?? [];

    return statuses.map((status: string) => {
      // The tag reads `:<colour> <text>`; a tag without the colour is all text.
      const [type, text = ''] = status.startsWith(':')
        ? status.slice(1).split(/\s+(.+)/)
        : ['', status];

      return { type: (type || 'success') as NgDocColor, text: sentenceCase(text) };
    });
  });
}

/**
 * Writes a badge text in sentence case ("NEW STYLES" becomes "New styles").
 * @param text - The text of the status tag.
 * @returns The text in sentence case.
 */
function sentenceCase(text: string): string {
  const lower: string = text.trim().toLowerCase();

  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
