import { Clipboard } from '@angular/cdk/clipboard';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NgDocRootPage } from '@ng-doc/app/classes/root-page';
import { NgDocDemoComponent } from '@ng-doc/app/components/demo';
import { NgDocDemoDisplayerComponent } from '@ng-doc/app/components/demo-displayer';
import { NgDocHighlighterService } from '@ng-doc/app/services';
import { NgDocDemoActionOptions } from '@ng-doc/core/interfaces';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';

import {
  ChangeDetectionCase,
  describeChangeDetection,
} from '../change-detection/change-detection-modes';

// jsdom implements no Web Animations; tooltips and the expander await `animate().finished`.
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
  selector: 'ng-doc-button-demo',
  template: `<button type="button">Demo button</button>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class ButtonDemoComponent {}

/**
 * Highlighted code as the builder emits it.
 * @param language - Language id.
 * @param text - Escaped code.
 */
function highlighted(language: string, text: string): string {
  return `<pre class="shiki"><code class="language-${language}"><span class="line">${text}</span></code></pre>`;
}

const ROOT_PAGE: Partial<NgDocRootPage> = {
  page: { title: 'Page', mdFile: '', demos: { ButtonDemoComponent } },
  demoAssets: {
    ButtonDemoComponent: [
      { title: 'TypeScript', code: highlighted('typescript', 'export class Demo {}') },
      { title: 'HTML', code: highlighted('html', '&lt;button&gt;Demo&lt;/button&gt;') },
    ],
  },
};

@Component({
  selector: 'ng-doc-demo-host',
  template: `<ng-doc-demo componentName="ButtonDemoComponent" [options]="options()"></ng-doc-demo>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocDemoComponent],
})
class DemoHostComponent {
  readonly options = signal<NgDocDemoActionOptions>({});
}

@Component({
  selector: 'ng-doc-demo-displayer-host',
  template: `
    <ng-doc-demo-displayer code="<b>Demo</b>" [(expanded)]="expanded">
      <span class="demo">Demo</span>
    </ng-doc-demo-displayer>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocDemoDisplayerComponent],
})
class DemoDisplayerHostComponent {
  readonly expanded = signal<boolean>(false);
}

describeChangeDetection('NgDocDemoComponent', ({ providers }: ChangeDetectionCase) => {
  let fixture: ComponentFixture<DemoHostComponent>;
  let copied: string[];

  beforeEach(async () => {
    copied = [];
    TestBed.configureTestingModule({
      providers: [
        ...providers,
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: NgDocRootPage, useValue: ROOT_PAGE },
        {
          provide: Clipboard,
          useValue: { copy: (text: string): boolean => copied.push(text) > 0 },
        },
      ],
    });
    fixture = TestBed.createComponent(DemoHostComponent);
    await fixture.whenStable();
  });

  const query = <T extends Element = HTMLElement>(selector: string): T | null =>
    fixture.nativeElement.querySelector(selector);
  const views = (): HTMLButtonElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('[role="tab"]'));
  const selectedView = (): string | undefined =>
    views()
      .find((view: HTMLButtonElement) => view.getAttribute('aria-selected') === 'true')
      ?.textContent?.trim();

  it('opens on the preview, with one tab per source file', () => {
    expect(views().map((view: HTMLButtonElement) => view.textContent?.trim())).toEqual([
      'Preview',
      'TypeScript',
      'HTML',
    ]);
    expect(selectedView()).toBe('Preview');
    expect(query('.ng-doc-demo-stage')?.hidden).toBe(false);
    expect(query('.ng-doc-demo-stage button')?.textContent).toBe('Demo button');
    expect(query('.ng-doc-demo-source')).toBeNull();
  });

  it('switches to a source file and keeps the demo alive behind it', async () => {
    const demo: HTMLElement | null = query('ng-doc-button-demo');

    views()[2].click();
    await fixture.whenStable();

    expect(selectedView()).toBe('HTML');
    expect(query('.ng-doc-demo-stage')?.hidden).toBe(true);
    expect(query('.ng-doc-demo-source')?.textContent).toContain('<button>Demo</button>');
    // The width controls belong to the preview.
    expect(query('.ng-doc-demo-widths')).toBeNull();

    views()[0].click();
    await fixture.whenStable();

    expect(query('ng-doc-button-demo')).toBe(demo);
  });

  it('moves between the views with the arrow keys', async () => {
    views()[0].focus();
    views()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await fixture.whenStable();

    expect(selectedView()).toBe('HTML');
    expect(document.activeElement).toBe(views()[2]);
  });

  it('previews the demo at narrower widths', async () => {
    const widths: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.ng-doc-demo-width'),
    );

    expect(widths.map((width: HTMLButtonElement) => width.getAttribute('aria-pressed'))).toEqual([
      'true',
      'false',
      'false',
    ]);
    expect(query('.ng-doc-demo-width-readout')?.textContent?.trim()).toBe('100% × auto');

    widths[2].click();
    await fixture.whenStable();

    expect(query('.ng-doc-demo-stage')?.getAttribute('data-ng-doc-width')).toBe('280');
    expect(widths[2].getAttribute('aria-pressed')).toBe('true');
    expect(query('.ng-doc-demo-width-readout')?.textContent?.trim()).toBe('280 × auto');
  });

  it('copies the open source file as text, or the first one on the preview', async () => {
    const copy = (): void => query<HTMLButtonElement>('.ng-doc-demo-copy button')!.click();

    copy();
    await fixture.whenStable();
    views()[2].click();
    await fixture.whenStable();
    copy();
    await fixture.whenStable();

    expect(copied).toEqual(['export class Demo {}', '<button>Demo</button>']);
  });

  it('opens on the default source file with the expanded option', async () => {
    fixture.componentInstance.options.set({ expanded: true, defaultTab: 'HTML' });
    await fixture.whenStable();

    expect(selectedView()).toBe('HTML');
  });

  it('prefers the snippet marked opened over defaultTab, as before', async () => {
    const assets = ROOT_PAGE.demoAssets!['ButtonDemoComponent'];

    assets[0].opened = true;

    try {
      fixture.componentInstance.options.set({ expanded: true, defaultTab: 'HTML' });
      await fixture.whenStable();

      expect(selectedView()).toBe('TypeScript');
    } finally {
      delete assets[0].opened;
    }
  });

  it('renders the demo alone without the container', async () => {
    fixture.componentInstance.options.set({ container: false });
    await fixture.whenStable();

    expect(query('.ng-doc-demo-toolbar')).toBeNull();
    expect(query('ng-doc-demo')?.getAttribute('data-ng-doc-container')).toBe('false');
    expect(query('ng-doc-button-demo')).not.toBeNull();
  });
});

describeChangeDetection('NgDocDemoDisplayerComponent', ({ providers }: ChangeDetectionCase) => {
  let fixture: ComponentFixture<DemoDisplayerHostComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        ...providers,
        provideHttpClient(),
        provideHttpClientTesting(),
        // The highlighter loads shiki; the spec only needs the code as text.
        { provide: NgDocHighlighterService, useValue: { highlight: (code: string) => code } },
      ],
    });
    fixture = TestBed.createComponent(DemoDisplayerHostComponent);
    await fixture.whenStable();
  });

  const toggle = (): HTMLButtonElement =>
    fixture.nativeElement.querySelector('.ng-doc-demo-code-toggle');

  it('exposes the code toggle as a disclosure button', async () => {
    const region: HTMLElement = fixture.nativeElement.querySelector('.ng-doc-demo-code');

    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(toggle().getAttribute('aria-label')).toBe('Show code');
    expect(toggle().getAttribute('aria-controls')).toBe(region.id);
    // A collapsed, empty region would still be listed as a landmark.
    expect(region.hasAttribute('role')).toBe(false);
    expect(region.querySelector('ng-doc-code')).toBeNull();

    toggle().click();
    await fixture.whenStable();

    expect(region.getAttribute('role')).toBe('region');
    expect(region.getAttribute('aria-label')).toBe('Code');
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(toggle().getAttribute('aria-label')).toBe('Hide code');
    expect(fixture.componentInstance.expanded()).toBe(true);
    expect(region.querySelector('ng-doc-code')).not.toBeNull();
  });

  it('follows the expanded binding', async () => {
    fixture.componentInstance.expanded.set(true);
    await fixture.whenStable();

    expect(toggle().getAttribute('aria-expanded')).toBe('true');
  });
});
