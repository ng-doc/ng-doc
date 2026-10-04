import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  InputSignal,
  Signal,
  signal,
  WritableSignal,
} from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { NgDocRootPage } from '@ng-doc/app/classes/root-page';
import { isSameObject } from '@ng-doc/core/helpers/is-same-object';
import { objectKeys } from '@ng-doc/core/helpers/object-keys';
import {
  NgDocPlaygroundConfig,
  NgDocPlaygroundOptions,
  NgDocPlaygroundProperties,
} from '@ng-doc/core/interfaces';
import { NgDocAsArrayPipe } from '@ng-doc/ui-kit';

import { NgDocPlaygroundDemoComponent } from './playground-demo/playground-demo.component';
import { NgDocPlaygroundForm } from './playground-form';
import { NgDocPlaygroundPropertiesComponent } from './playground-properties/playground-properties.component';

/**
 * A playground: an inspector with a control per input and content slot of its target, and a demo
 * per selector (or the pipe) rendered with the chosen values.
 */
@Component({
  selector: 'ng-doc-playground',
  templateUrl: './playground.component.html',
  styleUrls: ['./playground.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocPlaygroundPropertiesComponent, NgDocPlaygroundDemoComponent, NgDocAsArrayPipe],
})
export class NgDocPlaygroundComponent<
  T extends NgDocPlaygroundProperties = NgDocPlaygroundProperties,
> implements AfterViewInit
{
  private readonly rootPage = inject(NgDocRootPage);
  private readonly formBuilder = inject(FormBuilder);

  /** The name of the playground in the page configuration. */
  readonly id: InputSignal<string> = input.required<string>();

  /** The name of the pipe, when the target is a pipe. */
  readonly pipeName: InputSignal<string> = input<string>('');

  /** The selectors of the target to render a demo for. */
  readonly selectors: InputSignal<string[]> = input<string[]>([]);

  /** The inputs of the target. */
  readonly properties: InputSignal<T | undefined> = input<T | undefined>(undefined);

  /** Options of the playground action; they extend the playground configuration. */
  readonly options: InputSignal<NgDocPlaygroundOptions> = input<NgDocPlaygroundOptions>({});

  /** Whether the demo is created again each time a value changes. */
  readonly recreateDemo: WritableSignal<boolean> = signal(false);

  /** The values of the inputs and content slots. */
  readonly formGroup: WritableSignal<FormGroup<NgDocPlaygroundForm> | undefined> =
    signal(undefined);

  /** The default values of the target's inputs, reported by the first demo. */
  readonly defaultValues: WritableSignal<Record<string, unknown> | undefined> = signal(undefined);

  /** The playground configuration of the page, extended by the options. */
  readonly configuration: Signal<NgDocPlaygroundConfig> = computed(() =>
    Object.assign({}, this.rootPage.page?.playgrounds?.[this.id()], this.options()),
  );

  private defaultProperties: Record<string, unknown> = {};
  private defaultContent: Record<string, boolean> = {};

  ngAfterViewInit(): void {
    this.defaultProperties = this.getPropertiesFormValues();
    this.defaultContent = this.getContentFormValues();

    const propertiesForm: FormGroup = this.formBuilder.group(this.defaultProperties);
    const contentForm: FormGroup = this.formBuilder.group(this.defaultContent);
    const formGroup: FormGroup<NgDocPlaygroundForm> = this.formBuilder.group({
      properties: propertiesForm,
      content: contentForm,
    });

    // `patchValue` is needed to set `undefined` values, otherwise they will be ignored by the Angular form
    formGroup.patchValue({
      properties: Object.assign({}, this.defaultProperties, this.configuration().inputs),
      content: this.defaultContent,
    });
    this.formGroup.set(formGroup);
  }

  protected isDefaultState(): boolean {
    const formGroup = this.formGroup();

    if (!formGroup) {
      return false;
    }

    return (
      isSameObject(formGroup.value.properties ?? {}, this.defaultValues() ?? {}) &&
      isSameObject(formGroup.value.content ?? {}, this.defaultContent ?? {})
    );
  }

  private getPropertiesFormValues(): Record<string, unknown> {
    const defaultValues = this.defaultValues();
    const formValues: Record<string, unknown> = objectKeys(this.properties() ?? {}).reduce(
      (controls: Record<string, unknown>, key: string) => {
        controls[key] = defaultValues ? defaultValues[key] : undefined;

        return controls;
      },
      {} as Record<string, unknown>,
    );

    return Object.assign({}, formValues, this.configuration().defaults);
  }

  private getContentFormValues(): Record<string, boolean> {
    return objectKeys(this.configuration().content ?? {}).reduce(
      (controls: Record<string, boolean>, key: string) => {
        controls[key] = false;

        return controls;
      },
      {} as Record<keyof T, boolean>,
    );
  }

  /** Sets every input and content slot back to its default value. */
  resetForm(): void {
    const formGroup = this.formGroup();

    formGroup?.reset({}, { emitEvent: false });
    formGroup?.patchValue({
      properties: this.defaultProperties,
      content: this.defaultContent,
    });
  }
}
