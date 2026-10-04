import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  Signal,
  signal,
  untracked,
} from '@angular/core';
import { NgDocCopyButtonComponent } from '@ng-doc/app/components/copy-button';
import { NgDocSanitizeHtmlPipe } from '@ng-doc/app/pipes';
import { NgDocPageProcessorComponent } from '@ng-doc/app/processors/page-processor';
import { linkProcessor } from '@ng-doc/app/processors/processors/link';
import { tooltipProcessor } from '@ng-doc/app/processors/processors/tooltip';
import { provideMainPageProcessor } from '@ng-doc/app/tokens';
import { NgDocIconComponent } from '@ng-doc/ui-kit';

/** Display names of common language ids; other ids are shown capitalized. */
const LANGUAGE_LABELS: Record<string, string> = {
  'angular-html': 'HTML',
  'angular-ts': 'TypeScript',
  bash: 'Shell',
  css: 'CSS',
  diff: 'Diff',
  html: 'HTML',
  javascript: 'JavaScript',
  js: 'JavaScript',
  json: 'JSON',
  jsonc: 'JSON',
  jsx: 'JSX',
  less: 'Less',
  markdown: 'Markdown',
  md: 'Markdown',
  mermaid: 'Mermaid',
  nunjucks: 'Nunjucks',
  sass: 'Sass',
  scss: 'SCSS',
  sh: 'Shell',
  shell: 'Shell',
  ts: 'TypeScript',
  tsx: 'TSX',
  typescript: 'TypeScript',
  xml: 'XML',
  yaml: 'YAML',
  yml: 'YAML',
};

/** Language ids of plain text, which get no language chip. */
const PLAIN_LANGUAGES: ReadonlySet<string> = new Set(['', 'text', 'txt', 'plain', 'plaintext']);

/** What the component reads back from the rendered code. */
interface NgDocRenderedCode {
  /** Language id from the `language-*` class of the `code` element. */
  language: string;
  /** One-based numbers of the highlighted lines. */
  highlightedLines: number[];
}

/**
 * Renders a code block: a header with the file name, the language and the highlighted lines
 * (shown when the block has a name or an icon), line numbers and a copy button.
 *
 * Line numbers are CSS counters, so they are neither copied nor announced. Setting the
 * `code-line-numbers` theme variable to `none` hides them.
 */
@Component({
  selector: 'ng-doc-code',
  templateUrl: './code.component.html',
  styleUrls: ['./code.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgDocIconComponent,
    NgDocPageProcessorComponent,
    NgDocCopyButtonComponent,
    NgDocSanitizeHtmlPipe,
  ],
  viewProviders: [provideMainPageProcessor([linkProcessor, tooltipProcessor])],
  host: {
    '[attr.data-ng-doc-has-header]': 'hasHeader()',
  },
})
export class NgDocCodeComponent implements AfterViewInit {
  private readonly elementRef: ElementRef<HTMLElement> = inject(ElementRef);

  /** Highlighted HTML of the code. When empty, the projected content is shown instead. */
  readonly html = input<string>('');

  /** Whether the copy button is shown. */
  readonly copyButton = input<boolean>(true);

  /** File name shown in the header. */
  readonly name = input<string | undefined>(undefined);

  /** Name of a custom icon shown before the file name. */
  readonly icon = input<string | undefined>(undefined);

  /** Whether the header bar is shown: a block with a file name or an icon has one. */
  readonly hasHeader: Signal<boolean> = computed(() => !!this.name() || !!this.icon());

  /** Language and highlighted lines of projected code, read from the DOM. */
  private readonly projected = signal<NgDocRenderedCode>({ language: '', highlightedLines: [] });

  /**
   * Language and highlighted lines of the code. Highlighted HTML is parsed as a string, so the
   * header is complete in server-rendered and prerendered pages; projected code is read from its
   * DOM, which the server renderer provides too.
   */
  private readonly rendered: Signal<NgDocRenderedCode> = computed(() => {
    const html: string = this.html();

    return html ? parseHighlightedCode(html) : this.projected();
  });

  /** Display name of the language; empty for plain text. */
  protected readonly language: Signal<string> = computed(() => {
    const id: string = this.rendered().language.toLowerCase();

    return PLAIN_LANGUAGES.has(id)
      ? ''
      : LANGUAGE_LABELS[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
  });

  /** The highlighted lines as text, for example "Lines 6–7" or "Lines 2, 5–6". */
  protected readonly range: Signal<string> = computed(() =>
    describeLines(this.rendered().highlightedLines),
  );

  /** Reads the text of the rendered code when the copy button is pressed. */
  protected readonly text = (): string => this.codeElement()?.textContent ?? '';

  /**
   * Reads projected code once the view has rendered it. The page's code is projected inside a
   * control-flow block, so it is in place only after the first render; this hook also runs on the
   * server, so prerendered pages get the language and the highlighted lines. The page processor
   * relies on that late projection: it replaces the page's `pre` with this component after
   * creating it.
   */
  ngAfterViewInit(): void {
    if (!untracked(this.html)) {
      this.projected.set(readProjectedCode(this.codeElement()));
    }
  }

  private codeElement(): HTMLElement | null {
    return this.elementRef.nativeElement.querySelector('pre code');
  }
}

/**
 * Reads the language and the highlighted lines of highlighted code HTML.
 * @param html - Highlighted HTML: a `pre > code.language-*` with one `span.line` per line.
 */
function parseHighlightedCode(html: string): NgDocRenderedCode {
  const language: string = /<code\b[^>]*\bclass="[^"]*\blanguage-([\w+#-]+)/.exec(html)?.[1] ?? '';
  const highlightedLines: number[] = [];
  let line: number = 0;

  for (const match of html.matchAll(/<span\b[^>]*\bclass="(line(?:\s[^"]*)?)"/g)) {
    line++;

    if (/\bhighlighted\b/.test(match[1])) {
      highlightedLines.push(line);
    }
  }

  return { language, highlightedLines };
}

/**
 * Reads the language and the highlighted lines of a rendered `code` element.
 * @param code - The `code` element, if any.
 */
function readProjectedCode(code: HTMLElement | null): NgDocRenderedCode {
  return {
    language:
      Array.from(code?.classList ?? [])
        .find((name: string) => name.startsWith('language-'))
        ?.slice('language-'.length) ?? '',
    highlightedLines: Array.from(code?.querySelectorAll('.line') ?? [])
      .map((line: Element, index: number) =>
        line.classList.contains('highlighted') ? index + 1 : 0,
      )
      .filter(Boolean),
  };
}

/**
 * Describes line numbers as ranges.
 * @param lines - Ascending one-based line numbers.
 * @returns "Line 3", "Lines 6–7" or "Lines 2, 5–6"; an empty string for no lines.
 */
function describeLines(lines: number[]): string {
  const ranges: Array<[number, number]> = [];

  for (const line of lines) {
    const last: [number, number] | undefined = ranges[ranges.length - 1];

    if (last && line === last[1] + 1) {
      last[1] = line;
    } else {
      ranges.push([line, line]);
    }
  }

  const text: string = ranges
    .map(([start, end]: [number, number]) => (start === end ? `${start}` : `${start}–${end}`))
    .join(', ');

  return text ? `${lines.length === 1 ? 'Line' : 'Lines'} ${text}` : '';
}
