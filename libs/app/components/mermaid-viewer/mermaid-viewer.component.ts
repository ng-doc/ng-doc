import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  PLATFORM_ID,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgDocSanitizeHtmlPipe } from '@ng-doc/app/pipes';
import { NgDocThemeService } from '@ng-doc/app/services/theme';
import { NG_DOC_MERMAID } from '@ng-doc/app/tokens';
import {
  MagnifierControllerComponent,
  NgDocMagnifierComponent,
  NgDocSpinnerComponent,
} from '@ng-doc/ui-kit';
import type { Mermaid } from 'mermaid';

let id = 0;

/** The init directive that renders one graph with Mermaid's dark theme. */
const DARK_THEME_DIRECTIVE = '%%{init: {"theme": "dark"}}%%\n';

/**
 * Renders a Mermaid graph in a zoomable, pannable viewer. The graph is rendered in the browser
 * only, again when it changes and when the theme changes.
 *
 * In the dark theme (or `auto` with a dark OS theme) the graph uses Mermaid's dark theme, unless
 * the graph or `provideMermaid` chooses a theme of its own.
 */
@Component({
  selector: 'ng-doc-mermaid-viewer',
  imports: [
    NgDocMagnifierComponent,
    MagnifierControllerComponent,
    NgDocSanitizeHtmlPipe,
    NgDocSpinnerComponent,
  ],
  templateUrl: './mermaid-viewer.component.html',
  styleUrl: './mermaid-viewer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocMermaidViewerComponent {
  /** Source of the Mermaid graph. */
  readonly graph = input.required<string>();

  protected readonly html = signal('');
  protected readonly pending = signal(true);
  protected readonly error = signal<Error | null>(null);
  protected readonly mermaid: Mermaid;

  protected readonly id = `ng-doc-mermaid-viewer-${id++}`;

  // Renders are asynchronous: only the result of the latest one is shown.
  private renderId = 0;

  private readonly document = inject(DOCUMENT);
  private readonly themeService = inject(NgDocThemeService);

  constructor() {
    const mermaid = inject(NG_DOC_MERMAID, { optional: true });

    if (!mermaid) {
      throw new Error(
        'Mermaid is not provided. Make sure that you provided mermaid using "provideMermaid" function.',
      );
    }

    this.mermaid = mermaid;

    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      effect(() => {
        const graph: string = this.graph();

        untracked(() => void this.render(graph));
      });

      this.themeService
        .themeChanges()
        .pipe(takeUntilDestroyed())
        .subscribe(() => void this.render(untracked(this.graph)));
    }
  }

  /**
   * Adds Mermaid's dark theme to the graph when the page is dark. A graph with front matter or an
   * init directive, and a theme set in `provideMermaid`, are left as they are.
   * @param graph - The graph source.
   * @returns The graph to render.
   */
  private themed(graph: string): string {
    const theme = this.themeService.currentTheme;
    const dark =
      theme === 'dark' ||
      (theme === 'auto' &&
        !!this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)').matches);
    const configuredTheme = this.mermaid.mermaidAPI?.getSiteConfig?.().theme;
    const ownTheme = /^\s*---/.test(graph) || /%%\{\s*init/.test(graph);

    return dark && !ownTheme && (!configuredTheme || configuredTheme === 'default')
      ? DARK_THEME_DIRECTIVE + graph
      : graph;
  }

  private async render(graph: string): Promise<void> {
    const renderId: number = ++this.renderId;

    try {
      const { svg } = await this.mermaid.render(this.id, this.themed(graph));

      if (renderId === this.renderId) {
        this.html.set(svg);
        this.error.set(null);
      }
    } catch (error: unknown) {
      if (renderId === this.renderId) {
        this.error.set(error as Error);
      }
    } finally {
      if (renderId === this.renderId) {
        this.pending.set(false);
      }
    }
  }
}
