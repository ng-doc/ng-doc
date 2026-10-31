import { APP_BASE_HREF } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component, signal, viewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NgDocRootPage } from '@ng-doc/app/classes/root-page';
import { NgDocPlaygroundComponent } from '@ng-doc/app/components/playground';
import {
  ɵencodePlaygroundValue,
  ɵNG_DOC_DEMO_MESSAGE_SOURCE,
  ɵNgDocPlaygroundEncodedValue,
  ɵplaygroundStateFromFragment,
} from '@ng-doc/app/demo-app';
import { provideNgDocTexts } from '@ng-doc/app/providers/texts';
import { provideTypeControl } from '@ng-doc/app/providers/type-control';
import { NgDocStringControlComponent } from '@ng-doc/app/type-controls';
import { NgDocPage, NgDocPlaygroundOptions } from '@ng-doc/core/interfaces';
import { afterAll, beforeAll, expect, it } from 'vitest';

import {
  ChangeDetectionCase,
  describeChangeDetection,
} from '../change-detection/change-detection-modes';

// jsdom implements no Web Animations; tooltips await `animate().finished`.
beforeAll(() => {
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    value: () => ({ finished: Promise.resolve() }) as unknown as Animation,
  });
});

afterAll(() => {
  delete (Element.prototype as Partial<Element>).animate;
});

@Component({
  selector: 'ng-doc-isolated-playground-host',
  template: `<ng-doc-playground
    id="TagPlayground"
    [selectors]="['ng-doc-tag', 'button[ngDocTag]']"
    [properties]="{
      label: { type: 'string', inputName: 'label' },
      tone: { type: 'NgDocTone', inputName: 'tone' }
    }"
    [options]="options()" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocPlaygroundComponent],
})
class PlaygroundHostComponent {
  readonly options = signal<NgDocPlaygroundOptions>({});
  readonly playground = viewChild.required(NgDocPlaygroundComponent);
}

/** A custom control whose values can't be put in a URL. */
@Component({ selector: 'ng-doc-tone-control', template: '' })
class ToneControlComponent {
  writeValue(): void {}
  registerOnChange(): void {}
  registerOnTouched(): void {}
}

/**
 *
 * @param value
 */
function encoded(value: unknown): ɵNgDocPlaygroundEncodedValue {
  const result = ɵencodePlaygroundValue(value);

  if (!result.ok) throw new Error(result.reason);
  return result.value;
}

describeChangeDetection(
  'An isolated NgDocPlaygroundComponent',
  ({ providers }: ChangeDetectionCase) => {
    interface Setup {
      readonly config?: NgDocPlaygroundOptions;
      readonly options?: NgDocPlaygroundOptions;
      readonly demoRoute?: string;
      readonly isolatedPlaygrounds?: boolean;
      readonly toneCloneable?: boolean;
    }

    /**
     *
     * @param setup
     */
    async function render(setup: Setup): Promise<ComponentFixture<PlaygroundHostComponent>> {
      const page: NgDocPage = {
        title: 'Tag',
        mdFile: '',
        playgrounds: { TagPlayground: { target: class {}, template: '', ...setup.config } },
      };

      TestBed.configureTestingModule({
        providers: [
          ...providers,
          provideHttpClient(),
          provideHttpClientTesting(),
          { provide: APP_BASE_HREF, useValue: '/' },
          {
            provide: NgDocRootPage,
            useValue: {
              page,
              demoRoute: 'demoRoute' in setup ? setup.demoRoute : 'demo-preview/docs/tag',
              isolatedPlaygrounds: setup.isolatedPlaygrounds,
            },
          },
          provideTypeControl('string', NgDocStringControlComponent, { order: 20, cloneable: true }),
          provideTypeControl('NgDocTone', ToneControlComponent as never, {
            cloneable: setup.toneCloneable,
          }),
        ],
      });

      const fixture = TestBed.createComponent(PlaygroundHostComponent);

      fixture.componentInstance.options.set(setup.options ?? {});
      await fixture.whenStable();
      await fixture.whenStable();
      return fixture;
    }

    const iframes = (fixture: ComponentFixture<PlaygroundHostComponent>): HTMLIFrameElement[] =>
      Array.from(fixture.nativeElement.querySelectorAll('iframe'));
    const note = (fixture: ComponentFixture<PlaygroundHostComponent>): string | undefined =>
      fixture.nativeElement.querySelector('.ng-doc-playground-note')?.textContent?.trim();
    const ready = (
      fixture: ComponentFixture<PlaygroundHostComponent>,
      defaults: Record<string, unknown>,
      uncloneable: string[] = [],
    ) =>
      fixture.componentInstance.playground().onFrameMessage({
        source: ɵNG_DOC_DEMO_MESSAGE_SOURCE,
        version: 1,
        type: 'playground-ready',
        defaults: Object.fromEntries(Object.entries(defaults).map(([k, v]) => [k, encoded(v)])),
        uncloneable,
      });

    it("shows each target in an iframe of its page, with the playground's own values", async () => {
      const fixture = await render({ options: { isolated: true, inputs: { label: 'Hi' } } });
      const [first, second] = iframes(fixture);

      expect(iframes(fixture)).toHaveLength(2);
      expect(first.getAttribute('src')).toBe(
        '/demo-preview/docs/tag/playground/TagPlayground/ng-doc-tag#~inputs=label,tone&label=Hi',
      );
      expect(second.getAttribute('src')).toMatch(
        /^\/demo-preview\/docs\/tag\/playground\/TagPlayground\/button-ngdoctag#/,
      );
      // The inspector waits for the defaults the iframe reports.
      expect(fixture.componentInstance.playground().formGroup()).toBeUndefined();
    });

    it('creates the form from the reported defaults and follows its values in the fragment', async () => {
      const fixture = await render({ options: { isolated: true } });
      const playground = fixture.componentInstance.playground();

      ready(fixture, { label: 'Tag', tone: 'calm' });
      await fixture.whenStable();

      expect(playground.formGroup()?.value.properties).toEqual({ label: 'Tag', tone: 'calm' });
      playground.formGroup()?.controls.properties.patchValue({ label: 'Changed' });
      await fixture.whenStable();

      const frame = playground.frames()?.get('ng-doc-tag');
      expect(ɵplaygroundStateFromFragment(frame!.fragment).properties).toEqual({
        label: 'Changed',
        tone: 'calm',
      });
      // The iframe keeps its first URL: later states replace only its location's fragment.
      expect(iframes(fixture)[0].getAttribute('src')).not.toContain('Changed');
      // The toolbar opens the current state in a new tab.
      expect(
        fixture.nativeElement.querySelector('a.ng-doc-demo-open')?.getAttribute('href'),
      ).toContain('label=Changed');
    });

    it("passes the action's data to its iframes", async () => {
      const fixture = await render({
        options: { isolated: true, data: { label: 'From the action' } },
      });

      expect(
        ɵplaygroundStateFromFragment(
          fixture.componentInstance.playground().frames()!.get('ng-doc-tag')!.fragment,
        ).data,
      ).toEqual({ label: 'From the action' });
    });

    it('follows the site option, unless the action or the configuration says otherwise', async () => {
      expect(iframes(await render({ isolatedPlaygrounds: true }))).toHaveLength(2);
      TestBed.resetTestingModule();
      expect(
        iframes(await render({ isolatedPlaygrounds: true, options: { isolated: false } })),
      ).toHaveLength(0);
      TestBed.resetTestingModule();
      expect(iframes(await render({ config: { isolated: true } }))).toHaveLength(2);
    });

    it('renders in the page without demo pages (the legacy engine)', async () => {
      const fixture = await render({ demoRoute: undefined, options: { isolated: true } });

      expect(iframes(fixture)).toHaveLength(0);
      expect(note(fixture)).toBeUndefined();
    });

    it('renders in the page, with a note, when a default cannot be sent', async () => {
      const fixture = await render({ options: { isolated: true } });

      ready(fixture, { label: 'Tag' }, ['tone']);
      await fixture.whenStable();

      expect(iframes(fixture)).toHaveLength(0);
      expect(note(fixture)).toContain('`tone`');
    });

    it('renders in the page, with a note, when a value cannot be sent', async () => {
      const fixture = await render({ options: { isolated: true } });
      const playground = fixture.componentInstance.playground();

      ready(fixture, { label: 'Tag', tone: 'calm' });
      await fixture.whenStable();
      playground.formGroup()?.controls.properties.patchValue({ tone: () => 'calm' });
      await fixture.whenStable();

      expect(iframes(fixture)).toHaveLength(0);
      expect(note(fixture)).toContain('`tone`');
      expect(note(fixture)).toContain('a function');
    });

    it("renders in the page from the start when a control isn't cloneable", async () => {
      const fixture = await render({ options: { isolated: true }, toneCloneable: false });

      expect(iframes(fixture)).toHaveLength(0);
      expect(note(fixture)).toContain("the control of `tone` doesn't support it");
    });

    it('renders in the page, with a note, when the iframe fails', async () => {
      const fixture = await render({ options: { isolated: true } });

      fixture.componentInstance.playground().onFrameMessage({
        source: ɵNG_DOC_DEMO_MESSAGE_SOURCE,
        version: 1,
        type: 'playground-error',
        phase: 'create',
        message: 'This playground does not exist.',
      });
      await fixture.whenStable();

      expect(iframes(fixture)).toHaveLength(0);
      expect(note(fixture)).toContain('This playground does not exist.');
    });

    it('renders in the page, with a note, when its iframe never answers', async () => {
      const fixture = await render({ options: { isolated: true } });

      fixture.componentInstance.playground().onFrameSilent();
      await fixture.whenStable();

      expect(iframes(fixture)).toHaveLength(0);
      expect(note(fixture)).toBe(
        'This playground runs in the page because its frame did not load.',
      );
    });

    it("renders in the page from the start when a selector of the option isn't the target's", async () => {
      const fixture = await render({ options: { isolated: true, selectors: 'ng-doc-unknown' } });

      expect(iframes(fixture)).toHaveLength(0);
      expect(note(fixture)).toBe(
        'This playground runs in the page because `ng-doc-unknown` is not a selector of its target.',
      );
    });

    it("isolates the selectors of the option that are the target's", async () => {
      const fixture = await render({ options: { isolated: true, selectors: 'button[ngDocTag]' } });

      expect(iframes(fixture).map((frame) => frame.getAttribute('src')?.split('#')[0])).toEqual([
        '/demo-preview/docs/tag/playground/TagPlayground/button-ngdoctag',
      ]);
      expect(iframes(fixture)[0].getAttribute('title')).toBe(
        'TagPlayground playground: button[ngDocTag]',
      );
    });

    it('takes its notes from provideNgDocTexts', async () => {
      TestBed.configureTestingModule({
        providers: [
          provideNgDocTexts({
            playground: { inPageFrameSilent: 'Die Vorschau läuft in der Seite.' },
          }),
        ],
      });
      const fixture = await render({ options: { isolated: true } });

      fixture.componentInstance.playground().onFrameSilent();
      await fixture.whenStable();

      expect(note(fixture)).toBe('Die Vorschau läuft in der Seite.');
    });
  },
);
