import {
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChildren,
  Directive,
  Signal,
} from '@angular/core';
import { NgDocOptionComponent } from '@ng-doc/ui-kit/components/option';
import { NgDocTextComponent } from '@ng-doc/ui-kit/components/text';

/**
 * Marks the header content of an option group.
 */
@Directive({
  selector: '[ngDocOptionGroupHeader]',
})
export class NgDocOptionGroupHeaderDirective {}

/**
 * Group of options with a header. The header is hidden while the group has no options.
 */
@Component({
  selector: 'ng-doc-option-group',
  templateUrl: './option-group.component.html',
  styleUrls: ['./option-group.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocTextComponent],
})
export class NgDocOptionGroupComponent<T> {
  /** Options of the group. */
  readonly options = contentChildren<NgDocOptionComponent<T>>(NgDocOptionComponent, {
    descendants: true,
  });

  /** Whether the header is shown. */
  readonly hasHeader: Signal<boolean> = computed(() => this.options().length > 0);
}
