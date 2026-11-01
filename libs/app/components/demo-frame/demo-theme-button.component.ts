import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  model,
  Signal,
} from '@angular/core';
import type { NgDocDemoTexts, NgDocThemeTexts } from '@ng-doc/app/interfaces';
import { NG_DOC_TEXTS } from '@ng-doc/app/tokens';
import { NgDocButtonIconComponent, NgDocTooltipDirective } from '@ng-doc/ui-kit';

/** The themes the button offers in turn; `undefined` follows the theme of the page. */
const THEMES: ReadonlyArray<string | undefined> = [undefined, 'light', 'dark'];

/**
 * The button beside an isolated demo that switches the theme of its iframe in turn: the page's
 * theme, Light and Dark. A `theme` option that is none of them, such as `auto` or the id of a
 * custom theme, is offered after the page's theme.
 */
@Component({
  selector: 'ng-doc-demo-theme-button',
  template: `<button
    type="button"
    ng-doc-button-icon
    [rounded]="false"
    [attr.aria-label]="texts.themeLabel({ current: name(theme()), next: name(next()) })"
    [ngDocTooltip]="texts.themeTooltip({ current: name(theme()) })"
    (click)="theme.set(next())">
    @switch (theme()) {
      @case ('light') {
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path
            d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      }
      @case ('dark') {
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      }
      @default {
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" />
        </svg>
      }
    }
  </button>`,
  styles: `
    :host {
      display: contents;
    }

    svg {
      width: 16px;
      height: 16px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocButtonIconComponent, NgDocTooltipDirective],
})
export class NgDocDemoThemeButtonComponent {
  protected readonly texts: NgDocDemoTexts = inject(NG_DOC_TEXTS).demo;
  private readonly themeTexts: NgDocThemeTexts = inject(NG_DOC_TEXTS).theme;

  /** The theme of the iframe, or `undefined` while it follows the page. */
  readonly theme = model<string | undefined>(undefined);

  /** The `theme` option of the demo, which the button offers too. */
  readonly configured = input<string | undefined>(undefined);

  /** The theme the next press switches to. */
  protected readonly next: Signal<string | undefined> = computed(() => {
    const configured = this.configured();
    const themes =
      configured && !THEMES.includes(configured)
        ? [undefined, configured, ...THEMES.slice(1)]
        : THEMES;

    return themes[(themes.indexOf(this.theme()) + 1) % themes.length];
  });

  /**
   * The name of a theme in the texts.
   * @param theme - A theme, or `undefined` for the page's.
   */
  protected name(theme: string | undefined): string {
    if (theme === undefined) return this.texts.themePage;
    if (theme === 'light' || theme === 'dark' || theme === 'auto') return this.themeTexts[theme];
    return theme;
  }
}
