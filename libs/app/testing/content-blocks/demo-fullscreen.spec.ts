import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NgDocRootPage } from '@ng-doc/app/classes/root-page';
import { NgDocDemoComponent } from '@ng-doc/app/components/demo';
import { NgDocDemoPaneComponent } from '@ng-doc/app/components/demo-pane';
import { NgDocDemoActionOptions, NgDocDemoPaneActionOptions } from '@ng-doc/core/interfaces';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';

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

/** A browser Fullscreen API on jsdom, which has none. */
interface FakeFullscreen {
  /** The elements that asked for fullscreen. */
  readonly requests: Element[];
  /** Leaves fullscreen as Esc does: without a call from the page. */
  escape(): void;
  /** Removes the API. */
  restore(): void;
}

/**
 * Installs a Fullscreen API that behaves like a browser's: a request makes the element the
 * fullscreen element and dispatches `fullscreenchange` on the document.
 * @param enabled - The value of `document.fullscreenEnabled`.
 * @returns The fake.
 */
function fakeFullscreen(enabled: boolean): FakeFullscreen {
  let element: Element | null = null;
  const change = (next: Element | null): void => {
    element = next;
    document.dispatchEvent(new Event('fullscreenchange'));
  };
  const fake: FakeFullscreen = {
    requests: [],
    escape: () => change(null),
    restore: () => {
      for (const name of ['fullscreenEnabled', 'fullscreenElement', 'exitFullscreen']) {
        Reflect.deleteProperty(document, name);
      }
      Reflect.deleteProperty(Element.prototype, 'requestFullscreen');
    },
  };

  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => enabled });
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => element });
  Object.defineProperty(document, 'exitFullscreen', {
    configurable: true,
    value: async (): Promise<void> => change(null),
  });
  Object.defineProperty(Element.prototype, 'requestFullscreen', {
    configurable: true,
    value: async function (this: Element): Promise<void> {
      fake.requests.push(this);
      change(this);
    },
  });

  return fake;
}

@Component({
  selector: 'ng-doc-button-demo',
  template: `<button type="button">Demo button</button>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class ButtonDemoComponent {}

const ROOT_PAGE: Partial<NgDocRootPage> = {
  page: { title: 'Page', mdFile: '', demos: { ButtonDemoComponent } },
  demoAssets: {
    ButtonDemoComponent: [{ title: 'TypeScript', code: '<pre>export class Demo {}</pre>' }],
  },
};

@Component({
  selector: 'ng-doc-demo-fullscreen-host',
  template: `
    <ng-doc-demo componentName="ButtonDemoComponent" [options]="demoOptions()" />
    <ng-doc-demo-pane componentName="ButtonDemoComponent" [options]="paneOptions()" />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocDemoComponent, NgDocDemoPaneComponent],
})
class DemoFullscreenHostComponent {
  readonly demoOptions = signal<NgDocDemoActionOptions>({});
  readonly paneOptions = signal<NgDocDemoPaneActionOptions>({});
}

describeChangeDetection('Fullscreen demos', ({ providers }: ChangeDetectionCase) => {
  let fixture: ComponentFixture<DemoFullscreenHostComponent>;
  let fake: FakeFullscreen;

  /**
   * Creates the demos with or without browser support for fullscreen.
   * @param enabled - The value of `document.fullscreenEnabled`.
   */
  async function create(enabled: boolean): Promise<void> {
    fake = fakeFullscreen(enabled);
    TestBed.configureTestingModule({
      providers: [
        ...providers,
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: NgDocRootPage, useValue: ROOT_PAGE },
      ],
    });
    fixture = TestBed.createComponent(DemoFullscreenHostComponent);
    await fixture.whenStable();
  }

  afterEach(() => {
    fixture.destroy();
    fake.restore();
  });

  const query = <T extends Element = HTMLElement>(selector: string): T | null =>
    fixture.nativeElement.querySelector(selector);
  const demoStage = (): HTMLElement => query('ng-doc-demo .ng-doc-demo-stage')!;
  const demoToggle = (): HTMLButtonElement | null =>
    query('ng-doc-demo .ng-doc-demo-toolbar .ng-doc-demo-fullscreen button');
  const paneStage = (): HTMLElement => query('ng-doc-demo-pane .ng-doc-demo-pane-stage')!;
  const paneToggle = (): HTMLButtonElement | null =>
    query('ng-doc-demo-pane .ng-doc-demo-pane-fullscreen button');

  it('adds a fullscreen button to the demo toolbar that shows the stage fullscreen', async () => {
    await create(true);

    expect(demoToggle()?.type).toBe('button');
    expect(demoToggle()?.getAttribute('aria-label')).toBe('Fullscreen');
    expect(demoStage().querySelector('.ng-doc-demo-fullscreen-exit')).toBeNull();

    demoToggle()!.click();
    await fixture.whenStable();

    expect(fake.requests).toEqual([demoStage()]);
    expect(demoStage().getAttribute('data-ng-doc-fullscreen')).toBe('true');
    expect(demoToggle()?.getAttribute('aria-label')).toBe('Exit fullscreen');

    // The toolbar is not part of the fullscreen stage, which carries its own way out.
    const exit = demoStage().querySelector<HTMLButtonElement>(
      '.ng-doc-demo-fullscreen-exit button',
    );

    expect(exit?.getAttribute('aria-label')).toBe('Exit fullscreen');
    exit!.click();
    await fixture.whenStable();

    expect(document.fullscreenElement).toBeNull();
    expect(demoStage().getAttribute('data-ng-doc-fullscreen')).toBe('false');
    expect(demoStage().querySelector('.ng-doc-demo-fullscreen-exit')).toBeNull();
    expect(demoToggle()?.getAttribute('aria-label')).toBe('Fullscreen');
  });

  it('follows an exit with Esc', async () => {
    await create(true);
    demoToggle()!.click();
    await fixture.whenStable();

    fake.escape();
    await fixture.whenStable();

    expect(demoToggle()?.getAttribute('aria-label')).toBe('Fullscreen');
    expect(demoStage().querySelector('.ng-doc-demo-fullscreen-exit')).toBeNull();
  });

  it('offers fullscreen on the preview only', async () => {
    await create(true);

    query<HTMLButtonElement>('ng-doc-demo [role="tab"]:nth-of-type(2)')!.click();
    await fixture.whenStable();

    expect(demoToggle()).toBeNull();
  });

  it('draws the demo of a demo pane on the canvas of demos, with a fullscreen button', async () => {
    await create(true);

    expect(paneStage().hasAttribute('ngdocpanefront')).toBe(true);
    expect(paneStage().querySelector('ng-doc-button-demo')).not.toBeNull();
    expect(paneToggle()?.getAttribute('aria-label')).toBe('Fullscreen');

    paneToggle()!.click();
    await fixture.whenStable();

    expect(fake.requests).toEqual([paneStage()]);
    // The button is inside the stage, so it is also the way out of fullscreen.
    expect(paneToggle()?.getAttribute('aria-label')).toBe('Exit fullscreen');

    paneToggle()!.click();
    await fixture.whenStable();

    expect(document.fullscreenElement).toBeNull();
  });

  it('hides the fullscreen buttons where the browser does not support fullscreen', async () => {
    await create(false);

    expect(demoToggle()).toBeNull();
    expect(paneToggle()).toBeNull();
    expect(query('ng-doc-demo ng-doc-fullscreen-toggle')?.hidden).toBe(true);
    expect(query('ng-doc-demo-pane ng-doc-fullscreen-toggle')?.hidden).toBe(true);
  });

  it('shows no fullscreen button in place of a fullscreen route link', async () => {
    await create(true);
    fixture.componentInstance.demoOptions.set({ fullscreenRoute: 'button' });
    fixture.componentInstance.paneOptions.set({ fullscreenRoute: 'button' });
    await fixture.whenStable();

    expect(query('ng-doc-demo ng-doc-fullscreen-toggle')).toBeNull();
    expect(query('ng-doc-demo-pane ng-doc-fullscreen-toggle')).toBeNull();
    expect(query('ng-doc-demo ng-doc-fullscreen-button a')?.getAttribute('target')).toBe('_blank');
    expect(paneStage().querySelector('ng-doc-fullscreen-button a')).not.toBeNull();
  });
});
