import { inject, Injectable } from '@angular/core';
import { NG_DOC_SHIKI_THEME } from '@ng-doc/app/tokens';
import { HighlighterGeneric } from '@shikijs/core/types';
import { ThemeInput } from 'shiki';
import { createHighlighterCore } from 'shiki/core';
import getWasm from 'shiki/wasm';

export interface NgDocHighlighterConfig {
  /**
   * Themes sources.
   */
  themes?: ThemeInput[];
  /**
   * Theme that will be used for rendering the code blocks.
   */
  theme?: {
    light: string;
    dark: string;
  };
}

@Injectable({
  providedIn: 'root',
})
export class NgDocHighlighterService {
  highlighter?: HighlighterGeneric<string, string>;

  protected readonly theme = inject(NG_DOC_SHIKI_THEME);

  async initialize(config?: NgDocHighlighterConfig): Promise<void> {
    this.highlighter = (await createHighlighterCore({
      themes: [
        import('shiki/themes/catppuccin-latte.mjs'),
        import('shiki/themes/ayu-dark.mjs'),
        ...(config?.themes ?? []),
      ],
      langs: [import('shiki/langs/angular-html.mjs')],
      loadWasm: getWasm,
    })) as HighlighterGeneric<string, string>;
  }

  highlight(code: string): string {
    return this.highlighter!.codeToHtml(code, {
      lang: 'angular-html',
      themes: {
        light: this.theme.light || 'catppuccin-latte',
        dark: this.theme.dark || 'ayu-dark',
      },
    });
  }
}
