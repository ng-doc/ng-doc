import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { generateToc } from '@ng-doc/app/helpers';
import { NgDocPageProcessor } from '@ng-doc/app/interfaces';
import { NgDocPageProcessorComponent } from '@ng-doc/app/processors/page-processor';
import { tabsProcessor } from '@ng-doc/app/processors/processors';
import { NG_DOC_PAGE_CUSTOM_PROCESSOR, NG_DOC_PAGE_PROCESSOR } from '@ng-doc/app/tokens';
import { beforeEach, expect, it } from 'vitest';

import {
  ChangeDetectionCase,
  describeChangeDetection,
} from '../change-detection/change-detection-modes';

/*
 * Content tabs are `<ng-doc-tab group="…" name="…">` elements in the Markdown of a page. The tabs
 * processor groups them into one `NgDocTabsComponent`; demos and playgrounds inside have already
 * become components (their processors run first), and the processors after it, the page's own
 * processors included, must still reach the content of every tab.
 */

/** A component created for `<x-demo>`, standing in for a demo or a playground. */
@Component({
  selector: 'ng-doc-test-demo',
  template: '<span class="demo">[{{ label() }}]</span>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class DemoComponent {
  static created = 0;

  readonly label = input('');

  constructor() {
    DemoComponent.created++;
  }
}

/** A component created for `<em>`, standing in for the processors after the tabs processor. */
@Component({
  selector: 'ng-doc-test-late',
  template: '<span class="late">({{ label() }})</span>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class LateComponent {
  readonly label = input('');
}

const demoProcessor: NgDocPageProcessor<DemoComponent> = {
  component: DemoComponent,
  selector: 'x-demo',
  extractOptions: (element: Element) => ({ inputs: { label: element.textContent ?? '' } }),
};

const lateProcessor: NgDocPageProcessor<LateComponent> = {
  component: LateComponent,
  selector: 'em',
  extractOptions: (element: Element) => ({ inputs: { label: element.textContent ?? '' } }),
};

const customProcessor: NgDocPageProcessor<LateComponent> = {
  ...lateProcessor,
  selector: 'mark',
};

const PAGE = `
  <h2 id="above" headinglink="true" href="/page#above">Above</h2>
  <ng-doc-tab group="examples" name="First" icon="star">
    <h3 id="inside" headinglink="true" href="/page#inside">Inside</h3>
    <p><x-demo>one</x-demo></p>
    <div><ng-doc-tab group="code" name="a.ts"><pre>a</pre></ng-doc-tab></div>
    <div><ng-doc-tab group="code" name="b.ts"><pre>b</pre></ng-doc-tab></div>
  </ng-doc-tab>
  <ng-doc-tab group="examples" name="Second" active>
    <p><x-demo>two</x-demo> <em>late</em> <mark>custom</mark></p>
  </ng-doc-tab>
  <p class="after">after</p>
`;

@Component({
  selector: 'ng-doc-test-content-tabs-host',
  imports: [NgDocPageProcessorComponent],
  template: `<div class="content" [ngDocPageProcessor]="html()"></div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class HostComponent {
  readonly html = signal<SafeHtml>('');
}

/**
 * Waits for the page processor's pass and the renders after it.
 * @param fixture - The fixture.
 */
async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let round = 0; round < 3; round++) {
    fixture.detectChanges();
    await fixture.whenStable();
    await Promise.resolve();
  }
}

describeChangeDetection('content tabs', ({ providers }: ChangeDetectionCase) => {
  let fixture: ComponentFixture<HostComponent>;

  const root = (): HTMLElement => fixture.nativeElement.querySelector('.content');
  const groups = (): HTMLElement[] => Array.from(root().querySelectorAll('ng-doc-tabs'));
  const labels = (group: Element): string[] =>
    Array.from(group.querySelectorAll(':scope > ng-doc-tab-group > * [role="tab"]')).map(
      (tab: Element) => tab.textContent?.trim() ?? '',
    );
  const panel = (group: Element): Element =>
    group.querySelector(':scope > ng-doc-tab-group > [role="tabpanel"]')!;

  /**
   * Opens a tab of a group.
   * @param group - The tabs element.
   * @param label - The label of the tab.
   */
  async function open(group: Element, label: string): Promise<void> {
    const tab = Array.from(group.querySelectorAll<HTMLElement>('[role="tab"]')).find(
      (item: HTMLElement) => item.textContent?.trim() === label,
    );

    tab!.click();
    await settle(fixture);
  }

  beforeEach(async () => {
    DemoComponent.created = 0;
    TestBed.configureTestingModule({
      providers: [
        ...providers,
        // The tab icon loads its SVG.
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: NG_DOC_PAGE_PROCESSOR, useValue: demoProcessor, multi: true },
        { provide: NG_DOC_PAGE_PROCESSOR, useValue: tabsProcessor, multi: true },
        { provide: NG_DOC_PAGE_PROCESSOR, useValue: lateProcessor, multi: true },
        { provide: NG_DOC_PAGE_CUSTOM_PROCESSOR, useValue: customProcessor, multi: true },
      ],
    });
    fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.html.set(TestBed.inject(DomSanitizer).bypassSecurityTrustHtml(PAGE));
    await settle(fixture);
  });

  it('groups the tabs where the first one was and opens the active one', () => {
    const [examples] = groups();

    expect(groups()).toHaveLength(1);
    expect(labels(examples)).toEqual(['First', 'Second']);
    expect(examples.querySelector('[role="tab"] ng-doc-icon')).not.toBeNull();
    // The tab contents left the page: only the open one is shown, in the panel.
    expect(root().querySelectorAll(':scope > ng-doc-tab')).toHaveLength(0);
    expect(examples.nextElementSibling?.className).toBe('after');
    expect(panel(examples).textContent).toContain('[two]');
    expect(panel(examples).textContent).not.toContain('[one]');
  });

  it('runs the processors after the tabs processor, and the page’s own, inside every tab', () => {
    const [examples] = groups();

    expect(panel(examples).querySelector('.late')?.textContent).toBe('(late)');
    expect(panel(examples).querySelector('em')).toBeNull();
    expect(panel(examples).querySelectorAll('.late')[1]?.textContent).toBe('(custom)');
    expect(panel(examples).querySelector('mark')).toBeNull();
  });

  it('keeps the components of a tab alive while another tab is open', async () => {
    const [examples] = groups();

    expect(DemoComponent.created).toBe(2);

    await open(examples, 'First');
    expect(panel(examples).textContent).toContain('[one]');
    expect(panel(examples).textContent).not.toContain('[two]');

    await open(examples, 'Second');
    expect(panel(examples).textContent).toContain('[two]');
    expect(DemoComponent.created).toBe(2);
  });

  it('turns a group inside a tab into tabs of its own', async () => {
    const [examples] = groups();

    await open(examples, 'First');

    const code = panel(examples).querySelector('ng-doc-tabs')!;

    expect(code).not.toBeNull();
    expect(labels(code)).toEqual(['a.ts', 'b.ts']);
    expect(panel(code).textContent?.trim()).toBe('a');
    expect(panel(examples).querySelectorAll('ng-doc-tab[group="code"]')).toHaveLength(1);

    await open(code, 'b.ts');
    expect(panel(code).textContent?.trim()).toBe('b');
  });

  it('leaves the headings inside tabs out of the table of contents', async () => {
    const [examples] = groups();

    await open(examples, 'First');

    expect(panel(examples).querySelector('#inside')).not.toBeNull();
    expect(generateToc(root()).map((item) => item.hash)).toEqual(['above']);
  });
});
