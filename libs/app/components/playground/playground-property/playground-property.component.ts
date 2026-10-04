import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ComponentRef,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  reflectComponentType,
  Signal,
  signal,
  untracked,
  viewChild,
  ViewContainerRef,
} from '@angular/core';
import { FormControl } from '@angular/forms';
import { NgDocKindIconComponent } from '@ng-doc/app/components/kind-icon';
import { isPlaygroundProperty } from '@ng-doc/app/helpers';
import {
  NgDocProvidedTypeControl,
  NgDocTypeControl,
  NgDocTypeControlProviderOptions,
} from '@ng-doc/app/interfaces';
import { NgDocSanitizeHtmlPipe } from '@ng-doc/app/pipes';
import { extractValueOrThrow } from '@ng-doc/core/helpers/extract-value';
import { NgDocPlaygroundContent, NgDocPlaygroundProperty } from '@ng-doc/core/interfaces';
import { NgDocLabelComponent, NgDocTooltipDirective } from '@ng-doc/ui-kit';

let nextId = 0;

/** Value types that have a chip colour. */
const CHIP_TYPES: ReadonlySet<string> = new Set([
  'string',
  'number',
  'boolean',
  'object',
  'null',
  'undefined',
]);

/**
 * One row of the playground inspector: the input's name with its type chip, and the type
 * control that edits it, bound to the input's form control.
 */
@Component({
  selector: 'ng-doc-playground-property',
  templateUrl: './playground-property.component.html',
  styleUrls: ['./playground-property.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgDocLabelComponent,
    NgDocTooltipDirective,
    NgDocSanitizeHtmlPipe,
    NgDocKindIconComponent,
    NgTemplateOutlet,
  ],
  host: {
    '[attr.data-has-property-control]': 'hasPropertyControl()',
  },
})
export class NgDocPlaygroundPropertyComponent {
  /** Name of the input. */
  readonly name = input<string>('');

  /** The input, or the content slot. */
  readonly property = input<NgDocPlaygroundProperty | NgDocPlaygroundContent | undefined>(
    undefined,
  );

  /** The type control that edits the input. */
  readonly typeControl = input<NgDocProvidedTypeControl | undefined>(undefined);

  /** Form control of the input. */
  readonly control = input<FormControl | undefined>(undefined);

  /** Default value of the input. */
  readonly defaultValue = input<unknown>(undefined);

  /** Whether a type control is rendered. */
  readonly hasPropertyControl = signal<boolean>(false);

  /** Description of the input, shown in the tooltip of its name. */
  protected readonly tooltipContent: Signal<string> = computed(() => {
    const property: NgDocPlaygroundProperty | NgDocPlaygroundContent | undefined = this.property();

    return property && isPlaygroundProperty(property) ? property.description ?? '' : '';
  });

  /** Options of the type control provider. */
  protected readonly option: Signal<NgDocTypeControlProviderOptions | undefined> = computed(
    () => this.typeControl()?.options,
  );

  /** The value type shown as a chip under the name, or an empty string. */
  protected readonly typeChip: Signal<string> = computed(() => valueType(this.property()));

  /** Whether the row is a `<label>` around the control, unless its provider opts out. */
  protected readonly labelWrapper: Signal<boolean> = computed(
    () => this.option()?.labelWrapper !== false,
  );

  /** ID of the caption that names the control of a row without the `<label>`. */
  protected readonly captionId: string = `ng-doc-playground-property-caption-${nextId++}`;

  // The outlet is in the `<label>` or in the `<div>` of the row, so the query follows the branch.
  private readonly propertyOutlet = viewChild('propertyOutlet', { read: ViewContainerRef });

  private propertyTypeControl?: ComponentRef<NgDocTypeControl>;

  constructor() {
    // A plain effect, not an after-render hook: it runs during change detection on the server
    // too, so server-rendered and prerendered pages include the controls. The outlet is inside
    // the row's `@if` branch, so the query reports it once the branch renders, and the effect
    // runs again then. It also runs again when an input it reads changes.
    effect(() => {
      const outlet: ViewContainerRef | undefined = this.propertyOutlet();
      const property = this.property();
      const typeControl: NgDocProvidedTypeControl | undefined = this.typeControl();
      const control: FormControl | undefined = this.control();
      const defaultValue: unknown = this.defaultValue();

      if (outlet) {
        untracked(() => this.createControl(outlet, property, typeControl, control, defaultValue));
      }
    });

    inject(DestroyRef).onDestroy(() => this.propertyTypeControl?.destroy());
  }

  private createControl(
    outlet: ViewContainerRef,
    property: NgDocPlaygroundProperty | NgDocPlaygroundContent | undefined,
    typeControl: NgDocProvidedTypeControl | undefined,
    formControl: FormControl | undefined,
    defaultValue: unknown,
  ): void {
    if (!property || !typeControl) {
      return;
    }

    this.propertyTypeControl?.destroy();

    const control: ComponentRef<NgDocTypeControl> = outlet.createComponent(typeControl.control);

    this.propertyTypeControl = control;
    setTypeControlField(control, 'name', this.name());
    setTypeControlField(control, 'description', this.tooltipContent());
    setTypeControlField(
      control,
      'options',
      isPlaygroundProperty(property) ? property.options : undefined,
    );
    setTypeControlField(control, 'default', defaultValue);
    setTypeControlField(
      control,
      'isManual',
      isPlaygroundProperty(property) ? property.isManual : undefined,
    );
    control.instance.writeValue(formControl?.value);

    if (formControl) {
      formControl.registerOnChange((value: unknown) => control.instance.writeValue(value));
      control.instance.registerOnChange((value: unknown) => formControl.setValue(value));
      control.instance.registerOnTouched(() => formControl.markAsTouched());
    }

    this.hasPropertyControl.set(true);
  }
}

/**
 * The value type of an input: its declared type when it is a primitive, else the type of the first
 * value of its type alias. Content slots are booleans.
 * @param property - The input or the content slot.
 */
function valueType(property: NgDocPlaygroundProperty | NgDocPlaygroundContent | undefined): string {
  if (!property) {
    return '';
  }

  if (!isPlaygroundProperty(property)) {
    return 'boolean';
  }

  if (CHIP_TYPES.has(property.type)) {
    return property.type;
  }

  const option: string | undefined = property.options?.[0];

  if (option !== undefined) {
    try {
      const type: string = typeof (property.isManual ? option : extractValueOrThrow(option));

      return CHIP_TYPES.has(type) ? type : '';
    } catch {
      return '';
    }
  }

  return '';
}

/**
 * Sets a field of a type control: through `ComponentRef.setInput()` when the control declares it
 * as an input (a signal input or a decorator input), otherwise by assigning the plain field.
 * @param control - The created type control.
 * @param field - Name of the field.
 * @param value - Value to set.
 */
function setTypeControlField(
  control: ComponentRef<NgDocTypeControl>,
  field: keyof NgDocTypeControl,
  value: unknown,
): void {
  const input = reflectComponentType(control.componentType)?.inputs.find(
    ({ propName }: { propName: string }) => propName === field,
  );

  if (input) {
    control.setInput(input.templateName, value);
  } else {
    (control.instance as unknown as Record<string, unknown>)[field] = value;
  }
}
