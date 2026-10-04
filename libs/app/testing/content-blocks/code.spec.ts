import { Clipboard } from '@angular/cdk/clipboard';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DomSanitizer } from '@angular/platform-browser';
import { NgDocCodeComponent } from '@ng-doc/app/components/code';
import { NgDocCopyButtonComponent } from '@ng-doc/app/components/copy-button';
import { NgDocPageProcessorComponent } from '@ng-doc/app/processors/page-processor';
import { codeProcessor } from '@ng-doc/app/processors/processors';
import { NG_DOC_PAGE_PROCESSOR } from '@ng-doc/app/tokens';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';

import {
  ChangeDetectionCase,
  describeChangeDetection,
} from '../change-detection/change-detection-modes';

/**
 * Highlighted code as the builder emits it: one `.line` span per line.
 * @param language - Language id of the `code` element.
 * @param lines - Text of each line.
 * @param highlightedLines - One-based numbers of the highlighted lines.
 */
function highlighted(language: string, lines: string[], highlightedLines: number[] = []): string {
  const spans: string[] = lines.map(
    (line: string, index: number) =>
      `<span class="line${highlightedLines.includes(index + 1) ? ' highlighted' : ''}">${line}</span>`,
  );

  return `<pre class="shiki"><code class="language-${language}">${spans.join('\n')}</code></pre>`;
}

// jsdom implements no Web Animations; the copy button's tooltip awaits `animate().finished`.
beforeAll(() => {
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    value: () => ({ finished: Promise.resolve() }) as unknown as Animation,
  });
});

afterAll(() => {
  delete (Element.prototype as Partial<Element>).animate;
});

/**
 * Waits for the page processor's scheduled pass and the renders after it.
 * @param fixture - The fixture.
 */
async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let round = 0; round < 3; round++) {
    fixture.detectChanges();
    await fixture.whenStable();
    await Promise.resolve();
  }
}

@Component({
  selector: 'ng-doc-code-host',
  template: `<ng-doc-code [html]="html()" [name]="name()" [copyButton]="copy()"></ng-doc-code>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocCodeComponent],
})
class CodeHostComponent {
  readonly html = signal<string>(highlighted('typescript', ['const a = 1;', 'const b = 2;']));
  readonly name = signal<string | undefined>('file.ts');
  readonly copy = signal<boolean>(true);
}

describeChangeDetection('NgDocCodeComponent', ({ providers }: ChangeDetectionCase) => {
  let fixture: ComponentFixture<CodeHostComponent>;
  let copied: string[];

  beforeEach(async () => {
    copied = [];
    TestBed.configureTestingModule({
      providers: [
        ...providers,
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: Clipboard,
          useValue: { copy: (text: string): boolean => copied.push(text) > 0 },
        },
        { provide: NG_DOC_PAGE_PROCESSOR, useValue: codeProcessor, multi: true },
      ],
    });
    fixture = TestBed.createComponent(CodeHostComponent);
    await fixture.whenStable();
  });

  const host = (): HTMLElement => fixture.nativeElement.querySelector('ng-doc-code');
  const text = (selector: string): string | undefined =>
    host().querySelector(selector)?.textContent?.trim();

  it('shows the file name and the language chip in the header', () => {
    expect(host().getAttribute('data-ng-doc-has-header')).toBe('true');
    expect(text('.ng-doc-code-file-name')).toBe('file.ts');
    expect(text('.ng-doc-code-language')).toBe('TypeScript');
    expect(host().querySelector('.ng-doc-code-range')).toBeNull();
  });

  it('follows the code when it changes', async () => {
    fixture.componentInstance.html.set(
      highlighted('scss', ['a {}', 'b {}', 'c {}', 'd {}'], [1, 3, 4]),
    );
    await fixture.whenStable();

    expect(text('.ng-doc-code-language')).toBe('SCSS');
    expect(text('.ng-doc-code-range')).toBe('Lines 1, 3–4');

    fixture.componentInstance.html.set(highlighted('text', ['plain'], [1]));
    await fixture.whenStable();

    expect(host().querySelector('.ng-doc-code-language')).toBeNull();
    expect(text('.ng-doc-code-range')).toBe('Line 1');

    fixture.componentInstance.html.set(highlighted('twig', ['{{ a }}']));
    await fixture.whenStable();

    expect(text('.ng-doc-code-language')).toBe('Twig');
  });

  it('copies the rendered code from the header button', async () => {
    const button: HTMLButtonElement | null = host().querySelector(
      '.ng-doc-code-header ng-doc-copy-button button',
    );

    expect(button?.getAttribute('aria-label')).toBe('Copy to clipboard');
    // Only one copy button: the floating one is for blocks without a header.
    expect(host().querySelectorAll('ng-doc-copy-button').length).toBe(1);

    button?.click();
    await fixture.whenStable();

    expect(copied).toEqual(['const a = 1;\nconst b = 2;']);
  });

  it('floats the copy button over code without a header', async () => {
    fixture.componentInstance.name.set(undefined);
    await fixture.whenStable();

    expect(host().getAttribute('data-ng-doc-has-header')).toBe('false');
    expect(host().querySelector('.ng-doc-code-header')).toBeNull();
    expect(host().querySelector('.ng-doc-code-body > ng-doc-copy-button')).not.toBeNull();

    fixture.componentInstance.copy.set(false);
    await fixture.whenStable();

    expect(host().querySelector('ng-doc-copy-button')).toBeNull();
  });

  it('reads the language and the highlighted lines of page code it replaces', async () => {
    // The page processor replaces the page's `pre code` with a code block that projects it.
    const page: ComponentFixture<NgDocPageProcessorComponent> = TestBed.createComponent(
      NgDocPageProcessorComponent,
    );
    const pre: string = highlighted('scss', ['a {}', 'b {}'], [2]).replace(
      '<pre class="shiki">',
      '<pre class="shiki" name="styles.scss">',
    );

    // Page content is trusted HTML (the `pre` carries the block's name).
    page.componentRef.setInput(
      'ngDocPageProcessor',
      TestBed.inject(DomSanitizer).bypassSecurityTrustHtml(`<p>Before</p>${pre}`),
    );
    page.componentRef.setInput('contentVersion', 1);
    await settle(page);

    const block: HTMLElement | null = page.nativeElement.querySelector('ng-doc-code');

    expect(block?.querySelector('.ng-doc-code-file-name')?.textContent?.trim()).toBe('styles.scss');
    expect(block?.querySelector('.ng-doc-code-language')?.textContent?.trim()).toBe('SCSS');
    expect(block?.querySelector('.ng-doc-code-range')?.textContent?.trim()).toBe('Line 2');
    expect(block?.querySelector('.ng-doc-code-body pre code')).not.toBeNull();
  });

  it('copies a plain text given to the copy button', async () => {
    const button = TestBed.createComponent(NgDocCopyButtonComponent);

    button.componentRef.setInput('text', 'plain text');
    await button.whenStable();
    button.nativeElement.querySelector('button').click();
    await button.whenStable();

    expect(copied).toEqual(['plain text']);
  });
});
