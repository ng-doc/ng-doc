import {
  ChangeDetectionStrategy,
  Component,
  ComponentRef,
  computed,
  DestroyRef,
  inject,
  InjectionToken,
  Injector,
  input,
  InputSignal,
  model,
  OnChanges,
  OnDestroy,
  output,
  PendingTasks,
  Signal,
  signal,
  SimpleChanges,
  Type,
  viewChild,
  ViewContainerRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormGroup } from '@angular/forms';
import { NgDocDemoDisplayerComponent } from '@ng-doc/app/components/demo-displayer';
import {
  NgDocDemoFrameComponent,
  NgDocDemoThemeButtonComponent,
} from '@ng-doc/app/components/demo-frame';
import { ɵNgDocPlaygroundFrameMessage } from '@ng-doc/app/demo-app';
import { formatHtml } from '@ng-doc/app/helpers';
import { getPlaygroundDemoToken } from '@ng-doc/app/providers/playground-demo';
import { NgDocFormPartialValue } from '@ng-doc/app/types';
import {
  buildPlaygroundDemoPipeTemplate,
  buildPlaygroundDemoTemplate,
} from '@ng-doc/core/helpers/build-playground-demo-template';
import { objectKeys } from '@ng-doc/core/helpers/object-keys';
import { stringify } from '@ng-doc/core/helpers/stringify';
import { NgDocPlaygroundConfig, NgDocPlaygroundProperties } from '@ng-doc/core/interfaces';
import { Subject } from 'rxjs';
import { startWith, takeUntil } from 'rxjs/operators';

import { NgDocBasePlayground } from '../base-playground';
import { NgDocPlaygroundForm } from '../playground-form';

/**
 * The iframe an isolated playground shows a target in: the URL of the target's page in the demo
 * application, the fragment with the current state, and the iframe's accessible title.
 * @internal
 */
export interface ɵNgDocPlaygroundFrame {
  readonly url: string;
  readonly fragment: string;
  readonly title: string;
}

/**
 * One demo of a playground: it creates the generated playground class of its selector (or pipe),
 * passes it the form's values and shows the code of the current state. In an isolated playground
 * the class runs on a page of the demo application in an iframe, which gets the values from its
 * URL fragment, and reports the target's defaults back for the code view.
 */
@Component({
  selector: 'ng-doc-playground-demo',
  templateUrl: './playground-demo.component.html',
  styleUrls: ['./playground-demo.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocDemoDisplayerComponent, NgDocDemoFrameComponent, NgDocDemoThemeButtonComponent],
})
export class NgDocPlaygroundDemoComponent<
    T extends NgDocPlaygroundProperties = NgDocPlaygroundProperties,
  >
  implements OnChanges, OnDestroy
{
  /** The name of the playground in the page configuration. */
  readonly id: InputSignal<string> = input<string>('');

  /** The name of the pipe, when the target is a pipe. */
  readonly pipeName: InputSignal<string> = input<string>('');

  /** The selector of the target this demo renders. */
  readonly selector: InputSignal<string> = input<string>('');

  /** The playground configuration, extended by the action's options. */
  readonly configuration: InputSignal<NgDocPlaygroundConfig | undefined> = input<
    NgDocPlaygroundConfig | undefined
  >(undefined);

  /** The inputs of the target. */
  readonly properties: InputSignal<T | undefined> = input<T | undefined>(undefined);

  /** Whether the demo is created again each time a value changes. */
  readonly recreateDemo: InputSignal<boolean> = input<boolean>(false);

  /** The values of the inputs and content slots. */
  readonly form: InputSignal<FormGroup<NgDocPlaygroundForm> | undefined> = input<
    FormGroup<NgDocPlaygroundForm> | undefined
  >(undefined);

  /** Whether the code of the demo is shown. */
  readonly expanded: InputSignal<boolean> = input<boolean>(false);

  /** The iframe of an isolated playground; without it, the class is created in the page. */
  readonly frame: InputSignal<ɵNgDocPlaygroundFrame | undefined> = input<
    ɵNgDocPlaygroundFrame | undefined
  >(undefined);

  /** The defaults of the target's inputs that the iframe reported, for the code view. */
  readonly frameDefaults: InputSignal<Record<string, unknown> | undefined> = input<
    Record<string, unknown> | undefined
  >(undefined);

  /** The messages of the iframe of an isolated playground. */
  readonly frameMessage = output<ɵNgDocPlaygroundFrameMessage>();

  /** The iframe's page loaded but did not report the target in time. */
  readonly frameSilent = output<void>();

  /** The theme of the iframe, which the theme button beside the demo changes. */
  readonly frameTheme = model<string | undefined>(undefined);

  /** The `theme` option of the playground, which the theme button offers too. */
  readonly configuredTheme = input<string | undefined>(undefined);

  /** The iframe's page with the current state, which the toolbar opens in a new tab. */
  protected readonly frameUrl: Signal<string | undefined> = computed(() => {
    const frame = this.frame();

    return frame ? `${frame.url}#${frame.fragment}` : undefined;
  });

  /** Where the playground class is created. */
  readonly demoOutlet: Signal<ViewContainerRef | undefined> = viewChild('demoOutlet', {
    read: ViewContainerRef,
  });

  /** The generated playground class of this demo's selector or pipe. */
  playgroundDemo?: typeof NgDocBasePlayground;

  protected readonly code = signal('');

  protected readonly injector = inject(Injector);
  protected readonly destroyRef = inject(DestroyRef);
  private readonly pendingTasks = inject(PendingTasks);

  private demoRef?: ComponentRef<NgDocBasePlayground>;
  private readonly unsubscribe$: Subject<void> = new Subject<void>();

  async ngOnChanges({ form, id, frame }: SimpleChanges): Promise<void> {
    // A playground that falls back from its iframe to the page creates its class in the page.
    if (frame && !frame.firstChange && !this.frame()) {
      await this.updateDemo(this.form()?.value);
    }
    if (form || id) {
      this.unsubscribe$.next();

      const demoInjector: InjectionToken<Array<typeof NgDocBasePlayground>> | undefined =
        getPlaygroundDemoToken(this.id());

      if (demoInjector) {
        const demos: Array<typeof NgDocBasePlayground> = this.injector.get(demoInjector, []);

        this.playgroundDemo = demos.find(
          (demo: typeof NgDocBasePlayground) =>
            demo.selector === this.selector() || demo.selector === this.pipeName(),
        );
      }

      const form = this.form();

      if (!form) {
        // No values yet: the class is created so that it reports the target's defaults.
        await this.updateDemo();
        return;
      }
      // The form's values reach the class synchronously, in this check: the class may already be
      // attached again, and checked with no values its target would get `undefined` for every
      // input instead of its default.
      form.valueChanges
        .pipe(
          startWith(form.value),
          takeUntil(this.unsubscribe$),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe((data: NgDocFormPartialValue<FormGroup<NgDocPlaygroundForm>>) =>
          this.updateDemo(data),
        );
    }
  }

  private async updateDemo(
    data?: NgDocFormPartialValue<FormGroup<NgDocPlaygroundForm>>,
  ): Promise<void> {
    if (this.frame()) {
      await this.updateCodeView();
      return;
    }
    if (this.recreateDemo() || !this.demoRef) {
      this.createDemo();
    }

    if (data) {
      this.demoRef?.setInput('properties', data.properties ?? {});
      this.demoRef?.setInput('content', data.content ?? {});
      this.demoRef?.setInput('actionData', this.configuration()?.data ?? {});

      if (this.recreateDemo()) {
        this.demoRef?.instance.onReattached.subscribe(() => {
          this.demoRef?.changeDetectorRef.detectChanges();
        });
      }
    }

    await this.updateCodeView();
  }

  private createDemo(): void {
    if (this.playgroundDemo) {
      this.demoRef?.destroy();
      this.demoRef = this.demoOutlet()?.createComponent(
        this.playgroundDemo as unknown as Type<NgDocBasePlayground>,
      );
      this.demoRef?.changeDetectorRef.markForCheck();
    }
  }

  private async updateCodeView(): Promise<void> {
    const template: string = this.pipeName()
      ? buildPlaygroundDemoPipeTemplate(
          this.configuration()?.template ?? '',
          this.pipeName(),
          this.getActiveContent(),
          this.getPipeActiveInputs(),
        )
      : buildPlaygroundDemoTemplate(
          this.configuration()?.template ?? '',
          this.selector(),
          this.getActiveContent(),
          this.getActiveInputs(),
        );

    // Formatting loads the formatter asynchronously. Zoneless SSR waits only for pending tasks, so
    // the page would otherwise be serialized before the code view is filled.
    const done = this.pendingTasks.add();

    try {
      this.code.set(await formatHtml(template));
    } finally {
      done();
    }
  }

  private getActiveContent(): Record<string, string> {
    const formData: Record<string, boolean> =
      (this.form()?.controls.content.value as Record<string, boolean>) ?? {};

    return objectKeys(formData).reduce((result: Record<string, string>, key: string) => {
      result[key] = formData[key] ? this.configuration()?.content?.[key].template ?? '' : '';

      return result;
    }, {});
  }

  private getActiveInputs(): Record<string, string> {
    const formData: Record<string, unknown> =
      (this.form()?.controls.properties.value as Record<string, unknown>) ?? {};

    return objectKeys(formData).reduce((result: Record<string, string>, key: string) => {
      const inputName = this.properties()?.[key]?.inputName ?? key;
      const value: unknown = formData[key];
      const property: unknown | undefined = this.defaultValue(key);

      if (property !== value) {
        result[inputName] = stringify(value).replace(/"/g, `'`);
      }

      return result;
    }, {});
  }

  private getPipeActiveInputs(): Record<string, string> {
    const formData: Record<string, unknown> =
      (this.form()?.controls.properties.value as Record<string, unknown>) ?? {};
    let changedInputIndex: number = -1;

    return objectKeys(formData)
      .map((key: string, i: number) => {
        const value: unknown = formData[key];
        const defaultValue: unknown | undefined = this.defaultValue(key);

        if (defaultValue !== value) {
          changedInputIndex = i;
        }

        return key;
      })
      .slice(0, changedInputIndex + 1)
      .reduce((result: Record<string, string>, key: string) => {
        result[key] = stringify(formData[key]).replace(/"/g, `'`);

        return result;
      }, {});
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
  }

  /**
   * The default of an input: from the class in the page, or as the iframe reported it.
   * @param key
   */
  private defaultValue(key: string): unknown {
    return this.frame() ? this.frameDefaults()?.[key] : this.demoRef?.instance?.defaultValues[key];
  }
}
