import { inject, isDevMode, OnDestroy, Service, Signal, signal } from '@angular/core';
import { NG_DOC_SHIKI_THEME } from '@ng-doc/app/tokens';
import { ngDocSyntaxTheme } from '@ng-doc/core/constants/syntax-theme';
// Types only: Shiki, its Oniguruma engine and the WebAssembly binary load with the first
// `initialize()`, so an application that imports NgDoc only in a lazy route keeps them out of its
// initial bundle.
import type { HighlighterCore, LanguageInput, ThemeInput } from 'shiki/core';

/** Shiki configuration of the code highlighter. */
export interface NgDocHighlighterConfig {
  /**
   * Themes sources.
   */
  themes?: ThemeInput[];
  /**
   * Shiki languages to load besides `angular-html`, the language of playground code, and the
   * languages it embeds. A language named like one of them replaces it, so register here the
   * languages of `shiki.langs` in `ng-doc.config.ts` that playground code uses, for example a newer
   * Angular template grammar.
   */
  langs?: LanguageInput[];
  /**
   * Has no effect, and is reported in development mode.
   *
   * The theme names come from `shiki.themes` in `ng-doc.config.ts`: NgDoc highlights code blocks
   * with them when it builds the site, and passes them to the application (`NG_DOC_SHIKI_THEME`),
   * so the code that the browser highlights matches the code blocks.
   * @deprecated Set the theme names in `shiki.themes` of `ng-doc.config.ts` instead, and load
   * other themes with `themes`. This field will be removed in a future major release.
   */
  theme?: {
    light: string;
    dark: string;
  };
}

/**
 * Highlights code with Shiki. `provideNgDocApp` starts its initialization where it is provided (the
 * application, or the route that holds the documentation), and the server render waits for it.
 * Shiki is loaded on demand: `initialize()` imports it.
 */
@Service()
export class NgDocHighlighterService implements OnDestroy {
  private static defaultInitialization?: Promise<HighlighterCore>;

  private highlighter?: HighlighterCore;
  private initialization?: Promise<void>;
  private ownsHighlighter = false;
  private destroyed = false;
  private readonly readyState = signal(false);

  protected readonly theme = inject(NG_DOC_SHIKI_THEME);

  /**
   * Whether `highlight()` can highlight: `true` once `initialize()` has finished, and
   * `false` again after the service is destroyed.
   */
  readonly ready: Signal<boolean> = this.readyState.asReadonly();

  /**
   * Loads Shiki with the built-in themes (`github-light`, `ayu-dark` and NgDoc's `css-variables`)
   * and the given ones, and the given languages. Concurrent and repeated calls share one
   * initialization; a failed one can be retried.
   * @param config - Custom Shiki themes and languages to load.
   */
  initialize(config?: NgDocHighlighterConfig): Promise<void> {
    if (this.destroyed) {
      return Promise.reject(new Error('NgDoc highlighter has been destroyed.'));
    }
    if (this.initialization) {
      return this.initialization;
    }
    if (config?.theme && isDevMode()) {
      console.warn(
        '[NgDoc] `shiki.theme` of `provideNgDocApp` has no effect. Set the theme names in ' +
          '`shiki.themes` of `ng-doc.config.ts`: NgDoc uses them for the code blocks and the ' +
          'code that the browser highlights.',
      );
    }

    // Only immutable built-in themes and languages are shared across SSR applications. Custom
    // ones may reuse names with other definitions, or be asynchronous getters.
    this.ownsHighlighter = Boolean(config?.themes?.length || config?.langs?.length);
    const creation = this.ownsHighlighter
      ? NgDocHighlighterService.create(config?.themes, config?.langs)
      : (NgDocHighlighterService.defaultInitialization ??= NgDocHighlighterService.create().catch(
          (error: unknown) => {
            NgDocHighlighterService.defaultInitialization = undefined;
            throw error;
          },
        ));
    this.initialization = creation
      .then((highlighter) => {
        if (this.destroyed) {
          if (this.ownsHighlighter) {
            highlighter.dispose();
          }
          return;
        }
        this.highlighter = highlighter;
        this.readyState.set(true);
      })
      .catch((error: unknown) => {
        this.initialization = undefined;
        throw error;
      });
    return this.initialization;
  }

  /** Disposes the highlighter this service created for custom themes or languages. */
  ngOnDestroy(): void {
    this.destroyed = true;
    this.readyState.set(false);
    if (this.ownsHighlighter) {
      this.highlighter?.dispose();
    }
    this.highlighter = undefined;
  }

  private static async create(
    themes: ThemeInput[] = [],
    langs: LanguageInput[] = [],
  ): Promise<HighlighterCore> {
    const [{ createHighlighterCore }, { createOnigurumaEngine }] = await Promise.all([
      import('shiki/core'),
      import('shiki/engine/oniguruma'),
    ]);

    return createHighlighterCore({
      themes: [
        import('shiki/themes/github-light.mjs'),
        import('shiki/themes/ayu-dark.mjs'),
        // A new copy: Shiki changes the theme object it loads.
        ngDocSyntaxTheme(),
        ...themes,
      ],
      // Later registrations of a name replace earlier ones, so the given languages win.
      langs: [import('shiki/langs/angular-html.mjs'), ...langs],
      // The Oniguruma engine, as at build time, so that the browser tokenizes code as the code
      // blocks were tokenized.
      engine: createOnigurumaEngine(import('shiki/wasm')),
    });
  }

  /**
   * Returns the code as highlighted HTML, or an empty string before `initialize()` has
   * finished. It reads `ready()`, so a `computed` over it updates once Shiki is loaded.
   * @param code - Angular HTML to highlight.
   */
  highlight(code: string): string {
    if (!this.readyState()) return '';

    return (
      this.highlighter?.codeToHtml(code, {
        lang: 'angular-html',
        themes: {
          light: this.theme.light || 'github-light',
          dark: this.theme.dark || 'ayu-dark',
        },
      }) ?? ''
    );
  }
}
