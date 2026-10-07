import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component, signal, viewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NgDocRootPage } from '@ng-doc/app/classes/root-page';
import { NgDocPlaygroundComponent } from '@ng-doc/app/components/playground';
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
  selector: 'ng-doc-playground-host',
  // No selectors: the spec checks the inspector, not the demos.
  template: `<ng-doc-playground
    id="TagPlayground"
    [properties]="{ label: { type: 'string', inputName: 'label' } }"
    [options]="options()" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocPlaygroundComponent],
})
class PlaygroundHostComponent {
  readonly options = signal<NgDocPlaygroundOptions>({});
  readonly playground = viewChild.required(NgDocPlaygroundComponent);
}

describeChangeDetection('NgDocPlaygroundComponent', ({ providers }: ChangeDetectionCase) => {
  /**
   * Renders the playground with the page's configuration and the action's options. The first
   * demo reports the default values, and the inspector renders after it; there is no demo here,
   * so the spec reports them.
   * @param config - Options in the page's playground configuration.
   * @param options - Options of the action.
   */
  async function render(
    config: NgDocPlaygroundOptions,
    options: NgDocPlaygroundOptions = {},
  ): Promise<ComponentFixture<PlaygroundHostComponent>> {
    const page: NgDocPage = {
      title: 'Tag',
      mdFile: '',
      playgrounds: { TagPlayground: { target: class {}, template: '', ...config } },
    };

    TestBed.configureTestingModule({
      providers: [
        ...providers,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: NgDocRootPage, useValue: { page } },
        provideTypeControl('string', NgDocStringControlComponent, { order: 20 }),
      ],
    });

    const fixture: ComponentFixture<PlaygroundHostComponent> =
      TestBed.createComponent(PlaygroundHostComponent);

    fixture.componentInstance.options.set(options);
    await fixture.whenStable();
    fixture.componentInstance.playground().defaultValues.set({ label: 'Tag' });
    await fixture.whenStable();
    await fixture.whenStable();

    return fixture;
  }

  const setting = (fixture: ComponentFixture<PlaygroundHostComponent>): HTMLInputElement | null =>
    fixture.nativeElement.querySelector('.ng-doc-playground-setting input');

  it('starts with Recreate off by default', async () => {
    const fixture = await render({});

    expect(setting(fixture)?.checked).toBe(false);
    expect(fixture.componentInstance.playground().recreateDemo()).toBe(false);
  });

  it('starts with Recreate on when the option is true, and lets the reader turn it off', async () => {
    const fixture = await render({ recreate: true });

    expect(setting(fixture)?.checked).toBe(true);
    expect(fixture.componentInstance.playground().recreateDemo()).toBe(true);

    setting(fixture)!.click();
    await fixture.whenStable();

    expect(fixture.componentInstance.playground().recreateDemo()).toBe(false);
  });

  it("keeps Recreate on and hides the setting when the option is 'always'", async () => {
    const fixture = await render({ recreate: 'always' });

    expect(fixture.nativeElement.querySelector('.ng-doc-playground-setting')).toBeNull();
    expect(fixture.componentInstance.playground().recreateDemo()).toBe(true);
    // The rest of the inspector is unchanged.
    expect(fixture.nativeElement.querySelector('ng-doc-string-control')).not.toBeNull();
  });

  it("lets the action's option override the configuration's", async () => {
    const fixture = await render({ recreate: 'always' }, { recreate: false });

    expect(setting(fixture)?.checked).toBe(false);
    expect(fixture.componentInstance.playground().recreateDemo()).toBe(false);
  });
});
