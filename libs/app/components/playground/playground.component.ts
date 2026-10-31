import { APP_BASE_HREF, PlatformLocation } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  Injector,
  input,
  InputSignal,
  linkedSignal,
  Signal,
  signal,
  untracked,
  WritableSignal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup } from '@angular/forms';
import { NgDocRootPage } from '@ng-doc/app/classes/root-page';
import {
  ɵdecodePlaygroundValue,
  ɵNgDocPlaygroundFragment,
  ɵNgDocPlaygroundFrameMessage,
  ɵplaygroundStateToFragment,
  ɵwithDemoTheme,
} from '@ng-doc/app/demo-app';
import { NgDocPlaygroundTexts } from '@ng-doc/app/interfaces';
import { getTokenForType } from '@ng-doc/app/providers/type-control';
import { NG_DOC_TEXTS } from '@ng-doc/app/tokens';
import { isSameObject } from '@ng-doc/core/helpers/is-same-object';
import { objectKeys } from '@ng-doc/core/helpers/object-keys';
import { ɵplaygroundTargetSlugs } from '@ng-doc/core/helpers/playground-target-slugs';
import {
  NgDocPlaygroundConfig,
  NgDocPlaygroundOptions,
  NgDocPlaygroundProperties,
} from '@ng-doc/core/interfaces';
import { NgDocAsArrayPipe } from '@ng-doc/ui-kit';

import { ɵNG_DOC_PLAYGROUND_CONTAINER } from './playground-container';
import {
  NgDocPlaygroundDemoComponent,
  ɵNgDocPlaygroundFrame,
} from './playground-demo/playground-demo.component';
import { NgDocPlaygroundForm } from './playground-form';
import { NgDocPlaygroundPropertiesComponent } from './playground-properties/playground-properties.component';

/**
 * A playground: an inspector with a control per input and content slot of its target, and a demo
 * per selector (or the pipe) rendered with the chosen values.
 *
 * An isolated playground (the `isolated` option, or `isolatedPlaygrounds`) shows each demo in an
 * iframe of its page in the demo application, which the Vite engine builds. The inspector stays
 * here and passes the values in the iframe's URL fragment; the page reports the target's defaults
 * back. When a value can't be put in the URL, the playground renders its demos in the page
 * instead, with a note that names the input.
 */
@Component({
  selector: 'ng-doc-playground',
  templateUrl: './playground.component.html',
  styleUrls: ['./playground.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocPlaygroundPropertiesComponent, NgDocPlaygroundDemoComponent, NgDocAsArrayPipe],
  // The generated playground classes this playground creates report their defaults to it.
  providers: [{ provide: ɵNG_DOC_PLAYGROUND_CONTAINER, useExisting: NgDocPlaygroundComponent }],
})
export class NgDocPlaygroundComponent<
  T extends NgDocPlaygroundProperties = NgDocPlaygroundProperties,
> implements AfterViewInit
{
  private readonly rootPage = inject(NgDocRootPage);
  private readonly formBuilder = inject(FormBuilder);
  private readonly texts: NgDocPlaygroundTexts = inject(NG_DOC_TEXTS).playground;

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

  /** The values of the inputs and content slots. */
  readonly formGroup: WritableSignal<FormGroup<NgDocPlaygroundForm> | undefined> =
    signal(undefined);

  /** The default values of the target's inputs, reported by the first demo. */
  readonly defaultValues: WritableSignal<Record<string, unknown> | undefined> = signal(undefined);

  /** The playground configuration of the page, extended by the options. */
  readonly configuration: Signal<NgDocPlaygroundConfig> = computed(() =>
    Object.assign({}, this.rootPage.page?.playgrounds?.[this.id()], this.options()),
  );

  /**
   * Whether the demo is created again each time a value changes. It starts from the `recreate`
   * option; the reader can change it unless the option is `'always'`.
   */
  readonly recreateDemo: WritableSignal<boolean> = linkedSignal(
    () => !!this.configuration().recreate,
  );

  /** Whether the Recreate setting is fixed on, and hidden, by the `'always'` option. */
  readonly recreateLocked: Signal<boolean> = computed(
    () => this.configuration().recreate === 'always',
  );

  /**
   * The note that says why the playground renders in the page although it is isolated: the input
   * whose value can't be sent to its iframes, or what failed. Once set, it stays for the rest of
   * the visit.
   */
  readonly fallback: WritableSignal<string | undefined> = signal(undefined);

  /** Whether the demos are shown in iframes of their pages in the demo application. */
  readonly isolated: Signal<boolean> = computed(
    () =>
      !!this.rootPage.demoRoute &&
      !this.fallback() &&
      !this.uncloneableControl() &&
      !this.pagelessSelector() &&
      (this.configuration().isolated ?? this.rootPage.isolatedPlaygrounds ?? false),
  );

  /** The note that says why an isolated playground renders in the page. */
  readonly fallbackNote: Signal<string | undefined> = computed(() => {
    const note = this.uncloneableControl() ?? this.pagelessSelector() ?? this.fallback();

    return note && (this.configuration().isolated ?? this.rootPage.isolatedPlaygrounds)
      ? note
      : undefined;
  });

  /**
   * The theme of the iframes: the `theme` option, until the reader picks another with the theme
   * button beside a demo; `undefined` follows the page.
   */
  readonly frameTheme: WritableSignal<string | undefined> = linkedSignal(
    () => this.configuration().theme,
  );

  /** The iframe of each target, by selector or pipe name, while the playground is isolated. */
  readonly frames: Signal<Map<string, ɵNgDocPlaygroundFrame> | undefined> = computed(() => {
    const encoded = this.fragment();

    if (!this.isolated() || !encoded.ok) return undefined;
    const targets = this.targets();
    const slugs = ɵplaygroundTargetSlugs(targets);

    return new Map(
      targets.map((target: string, index: number) => [
        target,
        {
          url: this.pageUrl(slugs[index]),
          fragment: ɵwithDemoTheme(encoded.fragment, this.frameTheme())!,
          title: this.texts.frameTitle({ id: this.id(), target }),
        },
      ]),
    );
  });

  private readonly injector = inject(Injector);
  private readonly platformLocation = inject(PlatformLocation);
  private readonly appBaseHref = inject(APP_BASE_HREF, { optional: true });
  private readonly formValue = signal<{
    properties?: Record<string, unknown>;
    content?: Record<string, boolean>;
  }>({});
  private defaultProperties: Record<string, unknown> = {};
  private defaultContent: Record<string, boolean> = {};
  private viewInitialized = false;

  /** Every target of the playground, in the order of its page's routes: its selectors, or the pipe. */
  private readonly targets: Signal<string[]> = computed(() =>
    this.pipeName() ? [this.pipeName()] : this.selectors(),
  );

  /** The state of the iframes as a URL fragment. */
  private readonly fragment: Signal<ɵNgDocPlaygroundFragment> = computed(() => {
    const names = objectKeys(this.properties() ?? {}).map(String);
    const value = this.formValue();
    const configuration = this.configuration();
    // Before the iframe reported the defaults, it gets the playground's own values only.
    const properties =
      value.properties ??
      Object.fromEntries(
        Object.entries(Object.assign({}, configuration.defaults, configuration.inputs)).filter(
          ([name]) => names.includes(name),
        ),
      );

    return ɵplaygroundStateToFragment({
      inputs: names,
      properties,
      content: Object.entries(value.content ?? {})
        .filter(([, shown]) => shown)
        .map(([slot]) => slot),
      recreate: this.recreateDemo(),
      data: this.options().data,
    });
  });

  /**
   * An input whose control is declared not cloneable (`cloneable: false` of `provideTypeControl`):
   * the playground renders in the page from the start.
   */
  private readonly uncloneableControl: Signal<string | undefined> = computed(() => {
    const controls = this.configuration().controls ?? {};

    for (const [name, property] of Object.entries(this.properties() ?? {})) {
      const control = controls[name];
      const type = typeof control === 'string' ? control : control?.type ?? property.type;
      const token = getTokenForType(type);

      if (token && this.injector.get(token, null)?.options?.cloneable === false) {
        return this.texts.inPageControl({ input: name });
      }
    }
    return undefined;
  });

  /**
   * A selector of the `selectors` option that is not one of the target's: it has no page, so the
   * playground renders in the page from the start.
   */
  private readonly pagelessSelector: Signal<string | undefined> = computed(() => {
    if (this.pipeName()) return undefined;
    const option = this.configuration().selectors;
    const rendered = option === undefined ? [] : Array.isArray(option) ? option : [option];
    const selector = rendered.find((item: string) => !this.selectors().includes(item));

    return selector === undefined ? undefined : this.texts.inPageSelector({ selector });
  });

  constructor() {
    // A value that can't be put in the URL makes the playground render in the page.
    effect(() => {
      const encoded = this.fragment();

      if (!encoded.ok && this.isolated()) {
        untracked(() =>
          this.fallback.set(
            encoded.path
              ? this.texts.inPageValue({ input: encoded.path, reason: encoded.reason })
              : this.texts.inPageTooLong,
          ),
        );
      }
    });
    // A playground that fell back before its form existed creates it once a demo in the page has
    // reported the defaults. A playground in the page from the start creates it in
    // `ngAfterViewInit`, as before.
    effect(() => {
      if (this.fallback() && this.defaultValues() && !this.formGroup() && this.viewInitialized) {
        untracked(() => this.createForm());
      }
    });
  }

  /**
   * Takes a message of a demo's iframe: the target's defaults, which create the form, or a
   * failure, which makes the playground render in the page.
   * @param message - The message.
   * @internal
   */
  onFrameMessage(message: ɵNgDocPlaygroundFrameMessage): void {
    if (message.type === 'playground-error') {
      this.fallback.set(this.texts.inPageFrameError({ message: message.message }));
      return;
    }
    if (message.type !== 'playground-ready' || this.formGroup()) return;
    if (message.uncloneable.length) {
      this.fallback.set(this.texts.inPageDefault({ input: message.uncloneable[0] }));
      return;
    }
    this.defaultValues.set(
      Object.fromEntries(
        Object.entries(message.defaults).map(([name, value]) => [
          name,
          ɵdecodePlaygroundValue(value),
        ]),
      ),
    );
    this.createForm();
  }

  /**
   * Makes the playground render in the page when the page in an iframe loaded but did not report
   * the target, such as a page the build didn't make.
   * @internal
   */
  onFrameSilent(): void {
    if (!this.fallback()) this.fallback.set(this.texts.inPageFrameSilent);
  }

  ngAfterViewInit(): void {
    this.viewInitialized = true;
    // An isolated playground creates its form once its iframe reported the defaults.
    if (this.isolated()) return;
    this.createForm();
  }

  private createForm(): void {
    this.defaultProperties = this.getPropertiesFormValues();
    this.defaultContent = this.getContentFormValues();

    // `FormBuilder` reads an array as `[value, validators]`, so each value is wrapped: the default
    // of an array input is the value of its control.
    const propertiesForm: FormGroup = this.formBuilder.group(
      Object.fromEntries(
        Object.entries(this.defaultProperties).map(([key, value]) => [key, [value]]),
      ),
    );
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
    formGroup.valueChanges
      .pipe(takeUntilDestroyed(this.injector.get(DestroyRef)))
      .subscribe(() => this.formValue.set(formGroup.getRawValue()));
    this.formValue.set(formGroup.getRawValue());
  }

  /**
   * The URL of a target's page in the demo application, under the document's base href.
   * @param slug
   */
  private pageUrl(slug: string): string {
    const baseHref: string = (
      this.appBaseHref ??
      this.platformLocation.getBaseHrefFromDOM() ??
      '/'
    ).replace(/^\/+|\/+$/g, '');
    const path: string = [
      ...baseHref.split('/'),
      ...(this.rootPage.demoRoute ?? '').split('/'),
      'playground',
      this.id(),
      slug,
    ]
      .filter(Boolean)
      .map((segment: string) => encodeURIComponent(segment))
      .join('/');

    return `/${path}`;
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
