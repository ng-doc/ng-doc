import { ChangeDetectionStrategy, Component, computed, inject, input, Signal } from '@angular/core';
import { NgDocIconComponent } from '@ng-doc/ui-kit/components/icon';
import { NgDocBlockquoteTexts } from '@ng-doc/ui-kit/interfaces';
import { NG_DOC_UI_KIT_TEXTS } from '@ng-doc/ui-kit/tokens';
import { NgDocBlockquoteType } from '@ng-doc/ui-kit/types';

/** The icon of each built-in callout type; its title is in `NgDocBlockquoteTexts`. */
const BLOCKQUOTE_ICONS: Partial<Record<NgDocBlockquoteType, string>> = {
  note: 'info',
  warning: 'alert-triangle',
  alert: 'alert-circle',
  success: 'check',
};

/**
 * A callout. A Markdown blockquote whose first word is a bold type name, such as Note, renders
 * as this component.
 *
 * The `note`, `warning`, `alert` and `success` types show their icon and their name as a title
 * ("Note", "Warning", ...). A callout with a custom `icon` shows no type title, only its `label`
 * when it has one. The `default` type has neither an icon nor a title.
 */
@Component({
  selector: 'blockquote[ng-doc-blockquote]',
  templateUrl: './blockquote.component.html',
  styleUrls: ['./blockquote.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocIconComponent],
  host: {
    '[attr.data-ng-doc-type]': 'type()',
    '[attr.data-ng-doc-has-icon]': 'iconName() ? "" : null',
  },
})
export class NgDocBlockquoteComponent {
  /** Callout type; it selects the colour, the icon and the title. */
  readonly type = input<NgDocBlockquoteType>('default');

  /** Name of an icon that replaces the type's icon; the type title is not shown then. */
  readonly icon = input<string | undefined>(undefined);

  /** A title that replaces the type title, for example "Deprecated". */
  readonly label = input<string | undefined>(undefined);

  private readonly texts: NgDocBlockquoteTexts = inject(NG_DOC_UI_KIT_TEXTS).blockquote;

  /** The icon that is shown, if any. */
  protected readonly iconName: Signal<string | undefined> = computed(
    () => this.icon() || BLOCKQUOTE_ICONS[this.type()],
  );

  /** The title that is shown, if any. */
  protected readonly title: Signal<string | undefined> = computed(() => {
    const type: NgDocBlockquoteType = this.type();

    return (
      this.label() ||
      (this.icon() || !BLOCKQUOTE_ICONS[type]
        ? undefined
        : this.texts[type as keyof NgDocBlockquoteTexts])
    );
  });
}
