import { isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ComponentRef,
  DestroyRef,
  DOCUMENT,
  inject,
  Injector,
  PLATFORM_ID,
  signal,
  Type,
  viewChild,
  ViewContainerRef,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  ɵencodePlaygroundValue,
  ɵNG_DOC_DEMO_MESSAGE_SOURCE,
  ɵNgDocPlaygroundEncodedValue,
  ɵNgDocPlaygroundFrameMessage,
  ɵNgDocPlaygroundState,
  ɵplaygroundStateFromFragment,
} from '@ng-doc/app/demo-app';
import { NgDocPlaygroundTexts } from '@ng-doc/app/interfaces';
import { getPlaygroundDemoToken } from '@ng-doc/app/providers/playground-demo';
import { NG_DOC_TEXTS } from '@ng-doc/app/tokens';

import { NgDocBasePlayground } from '../base-playground';
import { ɵNG_DOC_PLAYGROUND_CONTAINER, ɵNgDocPlaygroundContainer } from '../playground-container';

/** A frame message without the fields every message has. */
type MessageBody<T> = T extends unknown ? Omit<T, 'source' | 'version'> : never;

/**
 * The route data of the page of an isolated playground: the playground's name in the page's
 * `playgrounds`, and the target it shows, a selector or a pipe's name.
 * @internal
 */
export interface ɵNgDocPlaygroundRouteData {
  readonly id: string;
  readonly selector?: string;
  readonly pipeName?: string;
}

const EMPTY_STATE: ɵNgDocPlaygroundState = {
  inputs: [],
  properties: {},
  content: [],
  recreate: false,
};

/**
 * Shows one target of a playground on a page of the demo application, for an isolated playground:
 * the generated playground class of the route's playground and target, without the inspector,
 * which stays on the documentation page. The state comes from the URL fragment, and a new
 * fragment applies a new state without a reload (the documentation page replaces it with
 * `location.replace`). The page tells the documentation page, with `postMessage`, the target's
 * default input values once it exists, each state it applied, and what failed.
 *
 * Like the demo host, it skips hydration: the server renders the target with its defaults, and
 * the browser renders it again with the fragment's state, which only the browser has.
 */
@Component({
  selector: 'ng-doc-playground-host',
  template: `
    <ng-container #outlet />
    @if (missing) {
      <p role="alert">{{ texts.missing }}</p>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { ngSkipHydration: 'true' },
  providers: [{ provide: ɵNG_DOC_PLAYGROUND_CONTAINER, useExisting: NgDocPlaygroundHostComponent }],
})
export class NgDocPlaygroundHostComponent implements ɵNgDocPlaygroundContainer {
  /** The target's inputs, by name, from the state: a pipe's parameters are positional. */
  readonly properties = signal<Readonly<Record<string, unknown>> | undefined>(undefined);

  /** The default values of the target's inputs, reported by the generated class. */
  readonly defaultValues = signal<Record<string, unknown> | undefined>(undefined);

  /** Whether the route names a playground or a target the page doesn't have. */
  protected readonly missing: boolean;

  protected readonly texts: NgDocPlaygroundTexts = inject(NG_DOC_TEXTS).playground;
  private readonly injector = inject(Injector);
  private readonly outlet = viewChild.required('outlet', { read: ViewContainerRef });
  private readonly window: Window | null = isPlatformBrowser(inject(PLATFORM_ID))
    ? inject(DOCUMENT).defaultView
    : null;
  private readonly playground?: Type<NgDocBasePlayground>;
  private reference?: ComponentRef<NgDocBasePlayground>;

  constructor() {
    const data: ɵNgDocPlaygroundRouteData | undefined =
      inject(ActivatedRoute).snapshot.data['ngDocPlayground'];
    const target = data?.selector ?? data?.pipeName;
    const token = data ? getPlaygroundDemoToken<typeof NgDocBasePlayground>(data.id) : undefined;
    const classes = token ? this.injector.get(token, []) : [];

    this.playground = classes.find((type) => type.selector === target) as
      | Type<NgDocBasePlayground>
      | undefined;
    this.missing = !this.playground;

    // The router updates the URL after it activates the route, so the fragment is read after
    // the first render.
    afterNextRender(() => this.start(this.readState() ?? EMPTY_STATE));
    const window = this.window;
    if (window) {
      const onHashChange = () => {
        const state = this.readState();

        // A malformed fragment is reported and leaves the target as it is.
        if (state) this.apply(state);
      };

      window.addEventListener('hashchange', onHashChange);
      inject(DestroyRef).onDestroy(() => window.removeEventListener('hashchange', onHashChange));
    }
  }

  /**
   * Creates the target with the first state, and reports its defaults once it has rendered.
   * @param state
   */
  private start(state: ɵNgDocPlaygroundState): void {
    this.properties.set(Object.fromEntries(state.inputs.map((name) => [name, true])));
    if (!this.playground) {
      this.post({
        type: 'playground-error',
        phase: 'create',
        message: this.texts.missing,
      });
      return;
    }
    if (!this.create(state)) return;
    // The generated class reads the target's defaults when it is first checked, which the next
    // render has done.
    afterNextRender(
      () => {
        const defaults: Record<string, ɵNgDocPlaygroundEncodedValue> = {};
        const uncloneable: string[] = [];

        for (const [name, value] of Object.entries(this.defaultValues() ?? {})) {
          const encoded = ɵencodePlaygroundValue(value);

          if (encoded.ok) defaults[name] = encoded.value;
          else uncloneable.push(name);
        }
        this.post({ type: 'playground-ready', defaults, uncloneable });
        this.applied();
      },
      { injector: this.injector },
    );
  }

  /**
   * Creates the target and sets the state; reports a failure instead of throwing.
   * @param state
   */
  private create(state: ɵNgDocPlaygroundState): boolean {
    if (!this.playground) return false;
    try {
      this.reference?.destroy();
      this.reference = this.outlet().createComponent(this.playground);
      this.setState(state);
      return true;
    } catch (error) {
      this.post({ type: 'playground-error', phase: 'create', message: describe(error) });
      return false;
    }
  }

  /**
   * Applies a state to the existing target, or creates it again when the state asks to.
   * @param state
   */
  private apply(state: ɵNgDocPlaygroundState): void {
    if (!this.reference) return;
    if (state.recreate) {
      if (this.create(state)) this.applied();
      return;
    }
    try {
      this.setState(state);
      this.applied();
    } catch (error) {
      this.post({ type: 'playground-error', phase: 'apply', message: describe(error) });
    }
  }

  private setState(state: ɵNgDocPlaygroundState): void {
    this.reference?.setInput('properties', state.properties);
    this.reference?.setInput(
      'content',
      Object.fromEntries(state.content.map((slot) => [slot, true])),
    );
    this.reference?.changeDetectorRef.markForCheck();
  }

  /** The state of the URL fragment; a malformed one is reported and reads as `undefined`. */
  private readState(): ɵNgDocPlaygroundState | undefined {
    const fragment = this.window?.location.hash ?? '';

    if (!fragment || fragment === '#') return EMPTY_STATE;
    try {
      return ɵplaygroundStateFromFragment(fragment);
    } catch (error) {
      this.post({ type: 'playground-error', phase: 'apply', message: describe(error) });
      return undefined;
    }
  }

  private applied(): void {
    this.post({
      type: 'playground-applied',
      fragment: (this.window?.location.hash ?? '').replace(/^#/, ''),
    });
  }

  private post(message: MessageBody<ɵNgDocPlaygroundFrameMessage>): void {
    const window = this.window;

    // Only a page of the same origin may receive it: the demo pages are part of the site.
    if (window && window.parent !== window) {
      window.parent.postMessage(
        { source: ɵNG_DOC_DEMO_MESSAGE_SOURCE, version: 1, ...message },
        window.location.origin,
      );
    }
  }
}

/**
 *
 * @param error
 */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
