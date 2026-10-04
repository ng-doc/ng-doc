import { ChangeDetectionStrategy, Component, computed, input, Signal } from '@angular/core';

/**
 * Words the kind chips show for declaration kinds whose name is not already a readable word.
 * Other kinds (and value types) are shown as they are.
 */
export const NG_DOC_KIND_LABELS: Readonly<Record<string, string>> = {
  TypeAlias: 'Type alias',
};

/**
 * The label a kind chip shows for a kind.
 * @param kind - Declaration kind (for example `Class` or `TypeAlias`) or value type (`string`).
 * @returns The word to show, for example "Type alias".
 */
export function ngDocKindLabel(kind: string): string {
  return NG_DOC_KIND_LABELS[kind] ?? kind;
}

/**
 * A word chip for a declaration kind (`Class`, `Component`, `Type alias`, ...) or a value type
 * (`string`, `boolean`, ...), coloured by the kind.
 */
@Component({
  selector: 'ng-doc-kind-icon',
  template: '{{ label() }}',
  styleUrls: ['./kind-icon.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-ng-doc-kind]': 'kind()',
    '[attr.data-ng-doc-type]': 'type()',
    '[attr.data-ng-doc-size]': 'size()',
  },
})
export class NgDocKindIconComponent {
  /** Declaration kind or value type. */
  readonly kind = input<string>('');

  /** Whether `kind` is a declaration kind or a value type; it selects the colours. */
  readonly type = input<'declaration' | 'type'>('declaration');

  /** `small` is the compact chip; `medium` the regular one. */
  readonly size = input<'small' | 'medium'>('small');

  /** The word the chip shows. */
  protected readonly label: Signal<string> = computed(() => ngDocKindLabel(this.kind()));
}
